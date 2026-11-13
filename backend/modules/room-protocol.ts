/**
 * The contract between the Worker and the room Durable Object.
 *
 * Two halves of the backend have to agree on three things: the internal
 * path the Worker calls to reserve a room, the storage key that proves a
 * room was minted, and the deadlines a room lives under. They live here so
 * the two halves cannot drift apart.
 */

/**
 * The internal path the Worker calls on the room Durable Object.
 *
 * It is not a public route: the Worker only reaches it through a Durable
 * Object stub, and `POST /internal/mint` from the outside is a 404 like
 * every other unknown path.
 */
export const MINT_PATH = '/internal/mint';

/**
 * The storage key that holds the time a room was minted.
 *
 * Its presence is what tells a reserved room from a guessed one. A peer
 * that joins a code nobody minted finds no room at all.
 */
export const MINTED_KEY = 'minted';

/**
 * How long a minted code stays valid.
 *
 * It is measured from the mint, not from the last use, so a code cannot be
 * kept alive by talking to it: the sender shares the code, the receiver
 * types it, and that window has to be long enough for a person to notice
 * the code, open a chat, and type it in — but short enough that a code
 * left on a screen stops working on its own.
 */
export const CODE_VALIDITY_MS = 10 * 60 * 1000;

/**
 * How long a room with two peers survives without any activity.
 *
 * Longer than the code window on purpose: once the peers are talking, the
 * session is worth keeping, and the files themselves travel peer-to-peer
 * rather than through the room.
 */
export const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
