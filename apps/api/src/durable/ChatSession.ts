import { DurableObject } from 'cloudflare:workers';

// Reserved for future per-session chat state (rolling summary, current topic, etc.).
// The DO is mounted so the binding exists; the v1 chat route stores full history in D1.
export class ChatSession extends DurableObject {}