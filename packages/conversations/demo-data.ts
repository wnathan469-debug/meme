import { DEMO_EVENT_ID, matchEvent } from "../events/model";
/** Deterministic public fiction, shared by the browser and private DEMO provider. */
import { demoPosts, demoUsers } from "../connectors/x/demo-data";
import { normalizePost, type RawPost } from "../connectors/x/contracts";
import type { ConversationPost } from "./model";
export const demoConversationId = "DEMO_POST_ROOT";
export const demoContract = "0xDEMO" + "0".repeat(34) + "42";
export const conversationDemoUsers = [
  ...demoUsers,
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `DEMO_COMMENTER_${i}`,
    username: `demo_commentaire_${i}`,
    name: `[DÉMO] Compte inventé ${i}`,
  })),
];
export const conversationDemoPosts: RawPost[] = [
  demoPosts[0],
  ...Array.from({ length: 35 }, (_, i): RawPost =>
    i === 0
      ? demoPosts[1]
      : {
          id: `DEMO_CONV_REPLY_${String(i + 1).padStart(2, "0")}`,
          author_id: `DEMO_COMMENTER_${i % 8}`,
          text:
            i >= 9 && i <= 13
              ? `[DÉMO] Même adresse fictive ${demoContract}`
              : i % 7 === 0
                ? `[DÉMO] Réponse ${i + 1} : adresse fictive ${demoContract}`
                : `[DÉMO] Réponse inventée ${i + 1} sur Nébula Mobile.`,
          created_at: new Date(Date.UTC(2026, 0, 15, 14, i + 6)).toISOString(),
          conversation_id: demoConversationId,
          referenced_tweets: [
            {
              id:
                i === 12
                  ? "DEMO_PARENT_MISSING"
                  : i === 13
                    ? "DEMO_CONV_REPLY_13"
                    : i === 2
                      ? "DEMO_POST_REPLY"
                      : demoConversationId,
              type: "replied_to",
            },
          ],
          lang: "fr",
          ...(i % 3 === 0
            ? {
                public_metrics: {
                  like_count: i,
                  reply_count: 0,
                  retweet_count: 0,
                  quote_count: 0,
                },
              }
            : {}),
        },
  ),
  demoPosts[2],
];
export function demoConversationSnapshot(): ConversationPost[] {
  return conversationDemoPosts.map((post) => {
    const user = conversationDemoUsers.find((u) => u.id === post.author_id);
    return {
      ...normalizePost(post, "DEMO", "2026-01-15T14:40:00.000Z"),
      author: user
        ? { id: user.id, username: user.username, name: user.name }
        : null,
      tokenIds: [],
      eventIds: matchEvent(
        normalizePost(post, "DEMO", "2026-01-15T14:40:00.000Z"),
        [{ kind: "phrase", text: "Nébula Mobile" }],
      )
        ? [DEMO_EVENT_ID]
        : [],
      followed: post.author_id === "DEMO_USER_A",
    };
  });
}
