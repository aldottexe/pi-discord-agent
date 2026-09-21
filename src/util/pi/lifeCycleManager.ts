import { AgentSession, AgentSessionEvent, AgentSessionEventListener, createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import PQueue, { PriorityQueue, QueueAddOptions } from "p-queue";

class PiChatSession {
   #session: AgentSession | undefined;
   async getSession() {
      await this.#session?.waitForIdle();
      return this.#session;
   }
   async setSession(s: AgentSession) {
      await this.#session?.waitForIdle();
      this.#session = s;
   }
}

class PiChatSessionManager {
   #session: PiChatSession;
   #modelRuntime: Promise<ModelRuntime>;
   readonly cwd: string;

   #onSessionChange: sessionChangeListener | undefined;
   #onPiEvent: AgentSessionEventListener | undefined;

   constructor(
      cwd: string,
      onSessionChange?: sessionChangeListener,
      onPiEvent?: AgentSessionEventListener
   ) {
      this.cwd = cwd;
      this.#modelRuntime = ModelRuntime.create();
      this.#session = new PiChatSession();
      this.#onSessionChange = onSessionChange;
      this.#onPiEvent = onPiEvent;
   }

   async #conitinueSession(): Promise<AgentSession> {
      const { session: s } = await createAgentSession({
         sessionManager: SessionManager.continueRecent(process.cwd()),
         modelRuntime: await this.#modelRuntime,
      });

      if (this.#onPiEvent)
         s.subscribe(this.#onPiEvent);

      await this.#session.setSession(s);

      if (this.#onSessionChange)
         this.#onSessionChange(s.sessionName, s.sessionFile);

      return s;
   }

   async #restoreSession(path: string): Promise<AgentSession> {
      let sm: SessionManager;
      try {
         sm = SessionManager.open(path);
      } catch (e) {
         process.stderr.write(`creating new session, couldn't open requested: ${path}\n${e}`)
         sm = SessionManager.create(process.cwd());
      }

      const { session: s } = await createAgentSession({
         sessionManager: sm,
         modelRuntime: await this.#modelRuntime,
      });

      if (this.#onPiEvent)
         s.subscribe(this.#onPiEvent);

      await this.#session.setSession(s);

      if (this.#onSessionChange)
         this.#onSessionChange(s.sessionName, s.sessionFile);

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

      if (this.#onSessionChange)
         this.#onSessionChange(s.sessionName, s.sessionFile);

      return s;
   }
}

type sessionChangeListener = (name?: string, path?: string) => void;

class PiChat {
   readonly cwd: string;
   #manager: PiChatSessionManager;

   // ACTIONS
   #actions: PQueue<PriorityQueue, QueueAddOptions> = new PQueue({ concurrency: 1 });

   // PI CHANGE EVENT
   #piEventListeners: AgentSessionEventListener[] = [];

   // SESSON CHANGE EVENT
   #sessionChangeListeners: sessionChangeListener[] = [];

   constructor(cwd: string) {
      this.cwd = cwd;
      this.#manager = new PiChatSessionManager(cwd, this.#onSessionChange, this.#onPiEvent);
   }

   async #message(prompt: string, sessionPath?: string) {
      const session = await this.#manager.getSession(sessionPath)
      session.prompt(prompt);
   }

   #onSessionChange(name?: string, path?: string) {
      this.#sessionChangeListeners.forEach(l => l(name || "", path || ""));
   }

   #onPiEvent: AgentSessionEventListener = (event: AgentSessionEvent) => {
      this.#piEventListeners.forEach(l => l(event));
   }

   queueAction(action: piChatAction) {
      this.#actions.add(async () => {
         switch (action.event) {
            case "message":
               this.#message(action.args.prompt, action.args.sessionPath)
               break;
            case "newSession":
               this.#manager.newSession();
               break;
         }
      });
   }

   addOnSessionChangeListener(onSessionChange: sessionChangeListener) {
      this.#sessionChangeListeners.push(onSessionChange);
   }

   addPiEventListener(l: AgentSessionEventListener) {
      this.#piEventListeners.push(l);
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
interface newSession extends piChatActionBase {
   event: "newSession"
}

type piChatAction = messageEvent | newSession;

export {
   PiChat,
   piChatAction,
}
