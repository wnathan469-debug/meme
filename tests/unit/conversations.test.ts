import { it, expect } from "vitest";
import {
  coverage,
  conversationTree,
  selectPosts,
  role,
  commenterSummary,
  contractCandidates,
} from "../../packages/conversations/model";
import {
  demoConversationSnapshot,
  demoConversationId as id,
  demoContract,
} from "../../packages/conversations/demo-data";
import { DemoConversationProvider } from "../../packages/connectors/x/demo-conversations";
import { XApiClient } from "../../packages/connectors/x/client";
import { MemoryControlStore } from "../../packages/connectors/x/control";
import {
  FakeClock,
  FakeTransport,
  config,
  reply,
} from "../fixtures/x/test-tools";
import posts from "../fixtures/x/posts.json";
import users from "../fixtures/x/users.json";
it("computes 35/120 without counting roots, citations, reposts or duplicates", () => {
  const snapshot = demoConversationSnapshot(),
    replies = snapshot.filter((p) => role(p, id) === "reply");
  expect(replies).toHaveLength(35);
  expect(snapshot.filter((p) => role(p, id) === "quote")).toHaveLength(1);
  expect(coverage(35, "120").percent).toBe("29,17");
  expect(coverage(35, null).percent).toBeNull();
  expect(coverage(0, "0").percent).toBeNull();
  expect(coverage(35, "20").inconsistent).toBe(true);
  expect(coverage(35, "20").percent).toBeNull();
  expect(coverage(35, "120", true).status).toBe("outside_api_window");
  expect(coverage(35, "120").banner).toContain("ne voit pas l’intégralité");
  expect(coverage(35, "12000000000000000000000").percent).toBe("0,00");
  const duplicated = [...snapshot, ...snapshot];
  expect(selectPosts(duplicated, {})).toHaveLength(snapshot.length);
  const repost = {
    ...snapshot[1],
    id: "DEMO_REPOST",
    type: "repost" as const,
    references: [{ id, type: "retweeted" as const }],
  };
  expect(role(repost, id)).toBeNull();
  expect(
    role({ ...repost, references: [{ id, type: "replied_to" }] }, id),
  ).toBeNull();
  expect(role({ ...snapshot[1], conversationId: "DEMO_OTHER" }, id)).toBeNull();
});
it("keeps missing parents explicit, reconstructs nested replies and bounds cycles", () => {
  const posts = demoConversationSnapshot(),
    tree = conversationTree(posts, id);
  expect(tree.find((n) => n.post.id === "DEMO_CONV_REPLY_03")?.depth).toBe(2);
  expect(
    tree.find((n) => n.post.id === "DEMO_CONV_REPLY_13")?.missingParent,
  ).toBe(true);
  expect(
    tree.find((n) => n.post.id === "DEMO_CONV_REPLY_14")?.missingParent,
  ).toBe(true);
  expect(tree.some((n) => n.post.type === "quote")).toBe(false);
  const a = {
      ...posts[1],
      id: "DEMO_CYCLE_A",
      references: [{ id: "DEMO_CYCLE_B", type: "replied_to" as const }],
    },
    b = {
      ...posts[1],
      id: "DEMO_CYCLE_B",
      references: [{ id: "DEMO_CYCLE_A", type: "replied_to" as const }],
    };
  expect(conversationTree([a, b], id).every((n) => n.cycle)).toBe(true);
  expect(conversationTree([a], id)[0].missingParent).toBe(true);
});
it("filters verified links separately from unverified address candidates and ranks missing interactions last", () => {
  const p = demoConversationSnapshot(),
    token = "00000000-0000-4000-8000-000000000011",
    event = "00000000-0000-4000-8000-000000000012";
  const linked = {
    ...p[1],
    tokenIds: [token],
    eventIds: [event],
    followed: true,
  };
  expect(
    selectPosts([...p.slice(0, 1), linked, ...p.slice(2)], {
      tokenId: token,
      eventId: event,
      followedOnly: true,
    }),
  ).toEqual([linked]);
  expect(
    selectPosts(p, { addressOnly: true }).every((p) =>
      p.text.includes(demoContract),
    ),
  ).toBe(true);
  expect(selectPosts(p, { text: "introuvable" })).toEqual([]);
  expect(contractCandidates(demoContract, "DEMO")).toEqual([demoContract]);
  expect(contractCandidates(demoContract, "REAL")).toEqual([]);
  expect(contractCandidates("0x" + "a".repeat(40), "REAL")).toHaveLength(1);
  const ordered = selectPosts(p, { sort: "interactions" });
  expect(ordered.at(-1)!.metrics.likes).toBeNull();
  expect(() => selectPosts(p, { tokenId: "invalid" })).toThrow();
});
it("summarizes commenters only within unique replies without individual profiles or inferred account age", () => {
  const p = demoConversationSnapshot(),
    s = commenterSummary([...p, ...p], id);
  expect(s.distinctCommenters).toBe(9);
  expect(s.publicationsInIdenticalGroups).toBe(5);
  expect(s.coordinationHypothesis).toContain("non prouvée");
  expect(s.recentAccountsProportion).toBeNull();
  expect(
    commenterSummary([{ ...p[1], authorId: null, text: "" }], id)
      .unknownAuthors,
  ).toBe(1);
  expect(commenterSummary([p[0]], id).coordinationHypothesis).toBeNull();
});
it("replays bounded DEMO conversation pages, citations and typed failures without network", async () => {
  const provider = new DemoConversationProvider(new FakeClock());
  let page = await provider.getConversation(id, { maxResults: 10 });
  expect(page.data).toHaveLength(10);
  expect(page.nextToken).not.toBeNull();
  const next = await provider.getConversation(id, {
    maxResults: 10,
    nextToken: page.nextToken!,
  });
  expect(next.data).toHaveLength(10);
  expect(next.data[0].id).not.toBe(page.data[0].id);
  expect((await provider.getQuotePosts(id)).data).toHaveLength(1);
  expect((await provider.getPostsByIds([id])).data[0].metrics.replies).toBe(
    120,
  );
  provider.simulate("rate_limit");
  await expect(provider.getConversation(id)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  await expect(
    provider.getConversation(id, { nextToken: "bad" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    provider.getConversation(id, { sinceId: "DEMO_UNKNOWN" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    (await provider.getConversation(id, { sinceId: "DEMO_CONV_REPLY_35" }))
      .data,
  ).toEqual([]);
});
it("requests only display fields for commenters, charges conversation root lookup to its feature and avoids profile caching", async () => {
  const cfg = await config(),
    transport = new FakeTransport([
      reply(posts),
      reply(posts),
      reply(posts),
      reply(users),
      reply(posts),
    ]),
    store = new MemoryControlStore(),
    client = new XApiClient(cfg, transport, store, {
      clock: new FakeClock(),
      random: () => 1,
    });
  const root = await client.getPostsByIds(["900000000000000000001"], {
    feature: "conversations",
  });
  expect(root.users[0].followers).toBeNull();
  expect(root.users[0].protected).toBeNull();
  await client.getConversation("900000000000000000001");
  await client.getQuotePosts("900000000000000000001");
  for (const call of transport.calls)
    expect(call.url.searchParams.get("user.fields")).toBe("id,name,username");
  expect(
    (await store.usage()).every((u) => u.feature === "conversations"),
  ).toBe(true);
  await client.getUserPosts("900000000000000000002");
  expect(transport.calls[3].url.pathname).toBe("/2/users");
  expect(transport.calls[3].url.searchParams.get("user.fields")).toContain(
    "protected",
  );
});

it("orders tree siblings by selected metrics, keeps parents before descendants and rejects unrelated reposts", () => {
  const posts = demoConversationSnapshot(),
    ordered = conversationTree(
      selectPosts(posts, { sort: "interactions" }),
      id,
    );
  const siblings = ordered.filter((n) => n.parentId === id);
  expect(siblings[0].post.metrics.likes).toBe(33);
  expect(
    ordered.findIndex((n) => n.post.id === "DEMO_POST_REPLY"),
  ).toBeLessThan(ordered.findIndex((n) => n.post.id === "DEMO_CONV_REPLY_03"));
  expect(
    conversationTree(
      [{ ...posts[1], id: "DEMO_UNRELATED", references: [], type: "repost" }],
      id,
    ),
  ).toEqual([]);
  const deep = Array.from({ length: 101 }, (_, i) => ({
    ...posts[1],
    id: `DEMO_DEEP_${i}`,
    references: [
      { id: i ? `DEMO_DEEP_${i - 1}` : id, type: "replied_to" as const },
    ],
  }));
  expect(conversationTree([posts[0], ...deep], id).at(-1)?.cycle).toBe(true);
});
