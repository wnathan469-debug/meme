import type Redis from "ioredis";
import { ProviderError } from "../../shared/errors";
import type {
  ControlStore,
  Reservation,
  Quota,
  CircuitPolicy,
  CapabilityObservation,
  Usage,
} from "./control";
// Monetary arithmetic is performed digit by digit. Lua numbers never hold money.
const decimal = `
local function valid(s) return type(s)=='string' and string.match(s,'^%d+$') and #s<=80 end
local function norm(s) s=string.gsub(s,'^0+','');if s=='' then return '0' end;return s end
local function cmp(a,b) a=norm(a);b=norm(b);if #a~=#b then return #a<#b and -1 or 1 end;if a==b then return 0 end;return a<b and -1 or 1 end
local function add(a,b)
 local i=#a;local j=#b;local carry=0;local out=''
 while i>0 or j>0 or carry>0 do
  local x=i>0 and tonumber(string.sub(a,i,i)) or 0
  local y=j>0 and tonumber(string.sub(b,j,j)) or 0
  local n=x+y+carry;out=tostring(n%10)..out;carry=math.floor(n/10);i=i-1;j=j-1
 end
 return norm(out)
end
local function sub(a,b)
 if cmp(a,b)<0 then return nil end
 local out='';local borrow=0;local j=#b
 for i=#a,1,-1 do
  local n=tonumber(string.sub(a,i,i))-borrow-(j>0 and tonumber(string.sub(b,j,j)) or 0)
  if n<0 then n=n+10;borrow=1 else borrow=0 end
  out=tostring(n)..out;j=j-1
 end
 return norm(out)
end
local function mul(a,n) local out='0';for i=1,n do out=add(out,a) end;return out end
`;
const reserveScript =
  decimal +
  `
if redis.call('EXISTS',KEYS[1])==1 or not valid(ARGV[1]) then return {-2,0} end
local amount=ARGV[1];local values={};local warning=0
for i=2,#KEYS do
 local limit=ARGV[i+2]
 if not valid(limit) then return {-2,0} end
 local oldLimit=redis.call('HGET',KEYS[i],'limit')
 if oldLimit and oldLimit~=limit then return {-2,0} end
 local current=redis.call('HGET',KEYS[i],'spent') or '0';local next=add(current,amount)
 if cmp(next,limit)>0 then return {-1,0} end
 if cmp(mul(next,100),mul(limit,tonumber(ARGV[3])))>=0 then warning=1 end
 values[i]=next
end
local keyList={}
for i=2,#KEYS do
 redis.call('HSET',KEYS[i],'spent',values[i],'limit',ARGV[i+2]);redis.call('PEXPIREAT',KEYS[i],ARGV[2]);table.insert(keyList,KEYS[i])
end
redis.call('HSET',KEYS[1],'amount',amount,'settled','','keys',cjson.encode(keyList));redis.call('PEXPIREAT',KEYS[1],ARGV[2])
return {1,warning}
`;
const settleScript =
  decimal +
  `
local amount=redis.call('HGET',KEYS[1],'amount')
if not amount or not valid(ARGV[1]) or cmp(ARGV[1],amount)>0 then return -2 end
local settled=redis.call('HGET',KEYS[1],'settled')
if settled~='' then if settled==ARGV[1] then return 1 else return -2 end end
local recorded=cjson.decode(redis.call('HGET',KEYS[1],'keys'))
if #recorded~=#KEYS-1 then return -2 end
local refund=sub(amount,ARGV[1]);local values={}
for i=2,#KEYS do
 if recorded[i-1]~=KEYS[i] then return -2 end
 local current=redis.call('HGET',KEYS[i],'spent')
 if not current then return -2 end
 values[i]=sub(current,refund);if not values[i] then return -2 end
end
for i=2,#KEYS do redis.call('HSET',KEYS[i],'spent',values[i]) end
redis.call('HSET',KEYS[1],'settled',ARGV[1]);return 1
`;
const rateScript = `
local now=tonumber(ARGV[1]);local interval=tonumber(ARGV[2]);local q=redis.call('GET',KEYS[1]);local remote=0
if q then
 q=cjson.decode(q)
 if q.resetAt~=cjson.null and q.resetAt<=now then redis.call('DEL',KEYS[1]);q=nil
 elseif q.remaining==0 then remote=q.resetAt~=cjson.null and q.resetAt or q.observedAt+60000 end
end
local next=tonumber(redis.call('GET',KEYS[2]) or '0');local untilAt=math.max(next,remote)
if untilAt>now then return untilAt-now end
if q and q.remaining~=cjson.null then q.remaining=math.max(0,q.remaining-1);redis.call('SET',KEYS[1],cjson.encode(q),'PX',math.max(86400000,q.resetAt~=cjson.null and q.resetAt-q.observedAt+60000 or 0)) end
redis.call('SET',KEYS[2],tostring(now+interval),'PX',math.max(1,interval));return 0
`;
const updateQuotaScript = `
local q=cjson.decode(ARGV[1]);local old=redis.call('GET',KEYS[1])
if old then
 old=cjson.decode(old)
 if old.resetAt~=cjson.null and q.resetAt~=cjson.null and q.resetAt<old.resetAt then return 1 end
 if old.resetAt==q.resetAt and old.remaining~=cjson.null and q.remaining~=cjson.null then q.remaining=math.min(old.remaining,q.remaining) end
end
redis.call('SET',KEYS[1],cjson.encode(q),'PX',math.max(86400000,q.resetAt~=cjson.null and q.resetAt-q.observedAt+60000 or 0));return 1
`;
const circuitScript = `
local value=redis.call('GET',KEYS[1]);local s=value and cjson.decode(value) or {failures=0,untilAt=0,lease=0}
local action=ARGV[1];local now=tonumber(ARGV[2]);local threshold=tonumber(ARGV[3]);local cooldown=tonumber(ARGV[4])
if action=='enter' then
 if s.untilAt>now or s.lease>now then return math.max(s.untilAt,s.lease)-now end
 if s.failures>=threshold then s.lease=now+cooldown end
elseif action=='success' then s.failures=0;s.untilAt=0;s.lease=0
elseif action=='failure' then s.failures=s.failures+1;s.lease=0;if s.failures>=threshold then s.untilAt=now+cooldown end
elseif action=='cancel' then s.lease=0
end
redis.call('SET',KEYS[1],cjson.encode(s),'PX',math.max(86400000,cooldown*4));return 0
`;
const usageScript = `
if redis.call('SET',KEYS[1],'1','NX','PX',2678400000) then redis.call('LPUSH',KEYS[2],ARGV[1]);redis.call('LTRIM',KEYS[2],0,9999) end
return 1
`;
export class RedisControlStore implements ControlStore {
  readonly scope = "shared" as const;
  private readonly prefix: string;
  constructor(
    private readonly redis: Redis,
    namespace: string,
  ) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace))
      throw new ProviderError("INVALID_INPUT");
    this.prefix = `{memeradar:REAL:x:${namespace}}:`;
  }
  private key(name: string): string {
    return this.prefix + name;
  }
  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("STORE_UNAVAILABLE");
    }
  }
  async reserve(value: Reservation): Promise<{ warning: boolean }> {
    return this.safe(async () => {
      const keys = [
        this.key(`reservation:${value.id}`),
        ...value.limits.map((item) => this.key(`budget:${item.key}`)),
      ];
      const result = (await this.redis.eval(
        reserveScript,
        keys.length,
        ...keys,
        value.amount,
        String(value.expiresAt),
        String(value.warningPercent),
        ...value.limits.map((item) => item.amount),
      )) as number[];
      if (result[0] === -1) throw new ProviderError("BUDGET_EXCEEDED");
      if (result[0] !== 1) throw new ProviderError("STORE_UNAVAILABLE");
      return { warning: result[1] === 1 };
    });
  }
  async settle(id: string, actual: string): Promise<void> {
    return this.safe(async () => {
      const key = this.key(`reservation:${id}`),
        raw = await this.redis.hget(key, "keys");
      if (!raw) throw new ProviderError("STORE_UNAVAILABLE");
      const keys = JSON.parse(raw) as unknown;
      if (
        !Array.isArray(keys) ||
        !keys.every((k) => typeof k === "string" && k.startsWith(this.prefix))
      )
        throw new ProviderError("STORE_UNAVAILABLE");
      const result = await this.redis.eval(
        settleScript,
        keys.length + 1,
        key,
        ...keys,
        actual,
      );
      if (result !== 1) throw new ProviderError("STORE_UNAVAILABLE");
    });
  }
  async takeRate(
    endpoint: string,
    now: number,
    intervalMs: number,
  ): Promise<void> {
    return this.safe(async () => {
      const wait = Number(
        await this.redis.eval(
          rateScript,
          2,
          this.key(`quota:${endpoint}`),
          this.key(`pace:${endpoint}`),
          String(now),
          String(intervalMs),
        ),
      );
      if (wait > 0) throw new ProviderError("RATE_LIMITED", true, wait);
    });
  }
  async deferRate(endpoint: string, until: number): Promise<void> {
    return this.safe(async () => {
      await this.redis.eval(
        "local old=tonumber(redis.call('GET',KEYS[1]) or '0');local next=math.max(old,tonumber(ARGV[1]));redis.call('SET',KEYS[1],tostring(next),'PX',math.max(86400000,next-tonumber(ARGV[2])+60000));return 1",
        1,
        this.key(`pace:${endpoint}`),
        String(until),
        String(Date.now()),
      );
    });
  }
  async updateQuota(endpoint: string, value: Quota): Promise<void> {
    return this.safe(async () => {
      await this.redis.eval(
        updateQuotaScript,
        1,
        this.key(`quota:${endpoint}`),
        JSON.stringify(value),
      );
    });
  }
  async quota(endpoint: string): Promise<Quota | null> {
    return this.safe(async () => {
      const raw = await this.redis.get(this.key(`quota:${endpoint}`));
      return raw ? (JSON.parse(raw) as Quota) : null;
    });
  }
  async enterCircuit(
    endpoint: string,
    now: number,
    policy: CircuitPolicy,
  ): Promise<void> {
    return this.safe(async () => {
      const wait = Number(
        await this.redis.eval(
          circuitScript,
          1,
          this.key(`circuit:${endpoint}`),
          "enter",
          String(now),
          String(policy.threshold),
          String(policy.cooldownMs),
        ),
      );
      if (wait > 0) throw new ProviderError("CIRCUIT_OPEN", false, wait);
    });
  }
  async finishCircuit(
    endpoint: string,
    now: number,
    result: "success" | "failure" | "cancel",
    policy: CircuitPolicy,
  ): Promise<void> {
    return this.safe(async () => {
      await this.redis.eval(
        circuitScript,
        1,
        this.key(`circuit:${endpoint}`),
        result,
        String(now),
        String(policy.threshold),
        String(policy.cooldownMs),
      );
    });
  }
  async capability(endpoint: string): Promise<CapabilityObservation | null> {
    return this.safe(async () => {
      const raw = await this.redis.hget(this.key("capabilities"), endpoint);
      return raw ? (JSON.parse(raw) as CapabilityObservation) : null;
    });
  }
  async setCapability(
    endpoint: string,
    value: CapabilityObservation,
  ): Promise<void> {
    return this.safe(async () => {
      await this.redis.hset(
        this.key("capabilities"),
        endpoint,
        JSON.stringify(value),
      );
    });
  }
  async appendUsage(value: Usage): Promise<void> {
    return this.safe(async () => {
      await this.redis.eval(
        usageScript,
        2,
        this.key(`usage:${value.requestId}`),
        this.key("usage"),
        JSON.stringify(value),
      );
    });
  }
  async usage(): Promise<Usage[]> {
    return this.safe(async () => {
      return (await this.redis.lrange(this.key("usage"), 0, 9999))
        .reverse()
        .map((value) => JSON.parse(value) as Usage);
    });
  }
}
