import { AgentSession, type AgentSessionEventListener, type AgentSessionEvent, createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import PQueue, { PriorityQueue, type QueueAddOptions } from "p-queue";

class PiChatSession {
   #session: AgentSession | undefined;

   async getSession() {
      await this.#session?.waitForIdle();
      return this.#session;
   }
   async setSession(s: AgentSession) {
      await this.#session?.waitForIdle();
      this.#session?.dispose();
      this.#session = s;
   }
}

class PiChatSessionManager {
   #session: PiChatSession;
   #modelRuntime: Promise<ModelRuntime>;
   readonly cwd: string;

   #onSessionChange: sessionChangeListener | undefined;
   #onPiEvent: AgentSessionEventListener | undefined;
   #onError: errorListener | undefined;

   constructor(
      cwd: string,
      onSessionChange?: sessionChangeListener,
      onPiEvent?: AgentSessionEventListener,
      onError?: errorListener
   ) {
      this.cwd = cwd;
      this.#modelRuntime = ModelRuntime.create();
      this.#session = new PiChatSession();
      this.#onSessionChange = onSessionChange;
      this.#onPiEvent = onPiEvent;
      this.#onError = onError;
   }

   async #conitinueSession(): Promise<AgentSession> {
      const { session: s } = await createAgentSession({
         sessionManager: SessionManager.continueRecent(process.cwd()),
         modelRuntime: await this.#modelRuntime,
      });

      if (!s.sessionFile) {
         const err = "restore session did not restore a session file"
         this.#onError?.(err);
         throw new Error(err);
      }

      if (this.#onPiEvent)
         s.subscribe(this.#onPiEvent);

      await this.#session.setSession(s);

      if (this.#onSessionChange)
         this.#onSessionChange({ name: s.sessionName, path: s.sessionFile });

      return s;
   }

   async #restoreSession(path: string): Promise<AgentSession> {
      let sm: SessionManager;

      try {
         sm = SessionManager.open(path);

      } catch (e) {
         const err = `creating new session, couldn't open requested: ${path}\n${e}`;
         process.stderr.write(err)
         this.#onError?.(err);

         sm = SessionManager.create(process.cwd());
      }

      const { session: s } = await createAgentSession({
         sessionManager: sm,
         modelRuntime: await this.#modelRuntime,
      });

      if (!s.sessionFile) {
         const err = "restore session did not restore a session file"
         this.#onError?.(err);
         throw new Error(err);
      }

      if (this.#onPiEvent)
         s.subscribe(this.#onPiEvent);

      await this.#session.setSession(s);

      if (this.#onSessionChange)
         this.#onSessionChange({ name: s.sessionName, path: s.sessionFile });

      return s;
   }

   async getSession(path?: string): Promise<AgentSession> {
      const session = await this.#session.getSession();

      if (
         !path &&
         !session
      ) {
         await this.#conitinueSession();
      }

      if (
         path &&
         !session
      ) {
         await this.#restoreSession(path);
      }

      if (
         session &&
         path &&
         session.sessionManager.getSessionFile() !== path
      ) {
         await this.#restoreSession(path);
      }
      const s = await this.#session.getSession()
      return s!;
   }

   async newSession(): Promise<AgentSession> {
      const { session: s } = await createAgentSession({
         sessionManager: SessionManager.create(process.cwd()),
         modelRuntime: await this.#modelRuntime,
      });


      // re-register events
      if (this.#onPiEvent)
         s.subscribe(this.#onPiEvent);

      await this.#session.setSession(s);

      if (!s.sessionFile) {
         const err = "couldn't make new session"
         this.#onError?.(err);
         throw new Error(err);
      }

      if (this.#onSessionChange)
         this.#onSessionChange({ name: s.sessionName, path: s.sessionFile });

      return s;
   }
}

class PiChat {
   readonly cwd: string;
   #manager: PiChatSessionManager;

   // ACTIONS
   #actions: PQueue<PriorityQueue, QueueAddOptions> = new PQueue({ concurrency: 1 });

   // PI EVENT
   #piEventListeners: AgentSessionEventListener[] = [];

   // SESSON CHANGE EVENT
   #sessionChangeListeners: sessionChangeListener[] = [];

   // ERROR EVENT
   #errorListeners: errorListener[] = [];

   constructor(cwd: string) {
      this.cwd = cwd;
      this.#manager = new PiChatSessionManager(cwd, this.#onSessionChange, this.#onPiEvent, this.#onError);
   }

   async #message(prompt: string, sessionPath?: string): Promise<string | undefined> {
      const session = await this.#manager.getSession(sessionPath)
      session.prompt(prompt);
      return session.sessionFile
   }

   #onPiEvent: AgentSessionEventListener = (event: AgentSessionEvent) => {
      this.#piEventListeners.forEach(l => l(event));
   }

   #onSessionChange: sessionChangeListener = (session: { name?: string, path: string }) => {
      this.#sessionChangeListeners.forEach(l => l(session));
   }

   #onError: errorListener = (error: string) => {
      this.#errorListeners.forEach(l => l(error));
   }

   async newSession(): Promise<string> {
      const session = await this.#manager.newSession()
      if (!session.sessionFile) {
         const err = "couldn't create new session";
         this.#onError?.(err);
         throw new Error(err);
      }
      return session.sessionFile
   }

   queueAction(action: piChatAction) {
      this.#actions.add(async () => {
         switch (action.event) {
            case "message":
               this.#message(action.args.prompt, action.args.sessionPath)
               break;
         }
      });
   }

   addPiEventListener(l: AgentSessionEventListener) {
      this.#piEventListeners.push(l);
   }

   addOnSessionChangeListener(onSessionChange: sessionChangeListener) {
      this.#sessionChangeListeners.push(onSessionChange);
   }

   addOnErrorListener(onError: errorListener) {
      this.#errorListeners.push(onError);
   }
}

interface piChatActionBase {
   event: string,
   args?: Record<string, string>
}
interface messageEvent extends piChatActionBase {
   event: "message",
   args: {
      prompt: string,
      sessionPath?: string,
   }
}

type piChatAction = messageEvent;

type sessionChangeListener = (session: { name?: string, path: string }) => void;
type errorListener = (error: string) => void

export {
   PiChat,
   type piChatAction,
   type sessionChangeListener
}
