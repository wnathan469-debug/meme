import { z } from "zod";
import type { Origin, XPost } from "../connectors/x/contracts";
export interface ConversationPost extends XPost {
  author: { id: string; username: string; name: string } | null;
  tokenIds: string[];
  eventIds: string[];
  followed: boolean;
}
export const conversationFilters = z.object({
  text: z.string().max(500).default(""),
  sort: z.enum(["date", "interactions"]).default("date"),
  addressOnly: z.boolean().default(false),
  tokenId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  followedOnly: z.boolean().default(false),
});
export type ConversationFilters = z.infer<typeof conversationFilters>;
export function contractCandidates(text: string, origin: Origin) {
  const pattern =
    origin === "DEMO"
      ? /\b(?:0xDEMO[0-9]{36}|DEMo[1-9A-HJ-NP-Za-km-z]{28,40})\b/g
      : /\b(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
  return [...new Set(text.match(pattern) ?? [])].slice(0, 100);
}
export function role(
  post: XPost,
  conversationId: string,
): "root" | "reply" | "quote" | null {
  if (post.id === conversationId) return "root";
  if (post.type === "repost") return null;
  if (
    post.conversationId === conversationId &&
    post.references.some((r) => r.type === "replied_to")
  )
    return "reply";
  if (
    post.type === "quote" &&
    post.references.some((r) => r.type === "quoted" && r.id === conversationId)
  )
    return "quote";
  return null;
}
export function uniquePosts(posts: ConversationPost[]) {
  const unique = new Map<string, ConversationPost>();
  for (const post of posts)
    if (
      !unique.has(post.id) ||
      Date.parse(unique.get(post.id)!.collectedAt) <=
        Date.parse(post.collectedAt)
    )
      unique.set(post.id, post);
  return [...unique.values()];
}
export function coverage(
  retrieved: number,
  reported: string | null,
  outsideWindow = false,
) {
  const count = BigInt(retrieved),
    denominator =
      reported && /^[0-9]{1,40}$/.test(reported) ? BigInt(reported) : null;
  const inconsistent = denominator !== null && count > denominator;
  const basis =
    denominator !== null && denominator > 0n && !inconsistent
      ? (count * 10000n + denominator / 2n) / denominator
      : null;
  const percent =
    basis === null
      ? null
      : `${basis / 100n},${String(basis % 100n).padStart(2, "0")}`;
  return {
    status: outsideWindow
      ? ("outside_api_window" as const)
      : ("partial" as const),
    retrieved,
    reported,
    percent,
    inconsistent,
    banner: `Conversation partielle : ${retrieved} réponses récupérées sur ${denominator === null ? "un nombre inconnu de réponses" : `environ ${reported}`} déclarées. L’application ne voit pas l’intégralité des réponses.`,
    windowNotice: outsideWindow
      ? "La racine dépasse la fenêtre temporelle accessible ; seules les réponses accessibles peuvent être récupérées."
      : null,
  };
}
export function selectPosts(posts: ConversationPost[], input: unknown) {
  const f = conversationFilters.parse(input);
  const interactions = (p: ConversationPost) => {
    const known = Object.values(p.metrics).filter(
      (n): n is number => n !== null,
    );
    return known.length ? known.reduce((sum, n) => sum + BigInt(n), 0n) : null;
  };
  return uniquePosts(posts)
    .filter(
      (p) =>
        p.text.toLowerCase().includes(f.text.toLowerCase()) &&
        (!f.addressOnly ||
          contractCandidates(p.text, p.dataOrigin).length > 0) &&
        (!f.tokenId || p.tokenIds.includes(f.tokenId)) &&
        (!f.eventId || p.eventIds.includes(f.eventId)) &&
        (!f.followedOnly || p.followed),
    )
    .sort((a, b) => {
      if (f.sort === "interactions") {
        const x = interactions(a),
          y = interactions(b);
        if (x !== y) {
          if (x === null) return 1;
          if (y === null) return -1;
          return x > y ? -1 : 1;
        }
      }
      return (
        (a.publishedAt ?? a.collectedAt).localeCompare(
          b.publishedAt ?? b.collectedAt,
        ) || a.id.localeCompare(b.id)
      );
    });
}
/** Flat tree: bounded traversal, explicit gaps and cycles; no recursive rendering of untrusted graphs. */
export function conversationTree(
  posts: ConversationPost[],
  conversationId: string,
) {
  const data = uniquePosts(posts).filter((p) =>
      ["root", "reply"].includes(role(p, conversationId) ?? ""),
    ),
    byId = new Map(data.map((p) => [p.id, p]));
  const nodes = data.map((post) => {
    let parent =
      post.id === conversationId
        ? null
        : (post.references.find((r) => r.type === "replied_to")?.id ?? null);
    let cursor = parent,
      depth = 0,
      missingParent = false,
      cycle = false;
    const seen = new Set([post.id]);
    while (cursor) {
      if (seen.has(cursor)) {
        cycle = true;
        break;
      }
      seen.add(cursor);
      const ancestor = byId.get(cursor);
      if (!ancestor) {
        missingParent = true;
        break;
      }
      depth++;
      if (depth >= 100) {
        cycle = true;
        break;
      }
      cursor =
        ancestor.id === conversationId
          ? null
          : (ancestor.references.find((r) => r.type === "replied_to")?.id ??
            null);
    }
    return { post, parentId: parent, depth, missingParent, cycle };
  });
  const children = new Map<string, typeof nodes>();
  for (const node of nodes)
    if (node.parentId && byId.has(node.parentId))
      children.set(node.parentId, [
        ...(children.get(node.parentId) ?? []),
        node,
      ]);
  const ordered: typeof nodes = [],
    seen = new Set<string>();
  const starts = [
    ...nodes.filter((n) => n.post.id === conversationId),
    ...nodes.filter((n) => !n.parentId || !byId.has(n.parentId)),
    ...nodes,
  ];
  for (const start of starts) {
    const stack = [start];
    while (stack.length) {
      const node = stack.pop()!;
      if (seen.has(node.post.id)) continue;
      seen.add(node.post.id);
      ordered.push(node);
      for (const child of [...(children.get(node.post.id) ?? [])].reverse())
        stack.push(child);
    }
  }
  return ordered;
}
export function commenterSummary(
  posts: ConversationPost[],
  conversationId: string,
) {
  const replies = uniquePosts(posts).filter(
    (p) => role(p, conversationId) === "reply",
  );
  const texts = new Map<string, ConversationPost[]>();
  for (const p of replies) {
    const text = p.text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (text) texts.set(text, [...(texts.get(text) ?? []), p]);
  }
  const groups = [...texts.values()].filter(
    (g) =>
      g.length >= 3 &&
      new Set(g.map((p) => p.authorId).filter(Boolean)).size >= 2,
  );
  return {
    distinctCommenters: new Set(replies.map((p) => p.authorId).filter(Boolean))
      .size,
    unknownAuthors: replies.filter((p) => !p.authorId).length,
    recentAccountsProportion: null,
    identicalTextGroups: groups.length,
    publicationsInIdenticalGroups: groups.reduce((sum, g) => sum + g.length, 0),
    coordinationHypothesis: groups.length
      ? "Textes identiques observés dans cette conversation ; coordination possible, non prouvée."
      : null,
    method:
      "Réponses uniques de cette conversation uniquement. Âge des comptes non collecté ; aucune fiche de commentateur créée.",
  };
}
