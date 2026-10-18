const at = "2026-01-15T14:00:00.000Z";
export const demoUsers = [
  {
    id: "DEMO_USER_A",
    name: "[DÉMO] Julie Cosmique",
    username: "demo_analyste_julie",
    protected: false,
  },
  {
    id: "DEMO_USER_B",
    name: "[DÉMO] Marc Boréal",
    username: "demo_fondateur_marc",
    protected: false,
  },
];
export const demoPosts = [
  {
    id: "DEMO_POST_ROOT",
    text: "[DÉMO] Une annonce entièrement fictive sur Nébula Mobile.",
    author_id: "DEMO_USER_A",
    created_at: at,
    conversation_id: "DEMO_POST_ROOT",
    referenced_tweets: [],
    public_metrics: {
      like_count: 8,
      reply_count: 120,
      retweet_count: 2,
      quote_count: 1,
    },
    lang: "fr",
  },
  {
    id: "DEMO_POST_REPLY",
    text: "[DÉMO] Réponse fictive, aucune publication X réelle.",
    author_id: "DEMO_USER_B",
    created_at: "2026-01-15T14:05:00.000Z",
    conversation_id: "DEMO_POST_ROOT",
    referenced_tweets: [{ id: "DEMO_POST_ROOT", type: "replied_to" as const }],
    lang: "fr",
  },
  {
    id: "DEMO_POST_QUOTE",
    text: "[DÉMO] Citation fictive de cette annonce.",
    author_id: "DEMO_USER_A",
    created_at: "2026-01-15T14:10:00.000Z",
    conversation_id: "DEMO_POST_QUOTE",
    referenced_tweets: [{ id: "DEMO_POST_ROOT", type: "quoted" as const }],
    lang: "fr",
  },
];
