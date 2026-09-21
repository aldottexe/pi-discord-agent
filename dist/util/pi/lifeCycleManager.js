import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import PQueue from "p-queue";
class PiChatSession {
    #session;
    async getSession() {
        await this.#session?.waitForIdle();
        return this.#session;
    }
    async setSession(s) {
        await this.#session?.waitForIdle();
        this.#session = s;
    }
}
class PiChatSessionManager {
    #session;
    #modelRuntime;
    cwd;
    #onSessionChange;
    #onPiEvent;
    constructor(cwd, onSessionChange, onPiEvent) {
        this.cwd = cwd;
        this.#modelRuntime = ModelRuntime.create();
        this.#session = new PiChatSession();
        this.#onSessionChange = onSessionChange;
        this.#onPiEvent = onPiEvent;
    }
    async #conitinueSession() {
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
    async #restoreSession(path) {
        let sm;
        try {
            sm = SessionManager.open(path);
        }
        catch (e) {
            process.stderr.write(`creating new session, couldn't open requested: ${path}\n${e}`);
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
    async getSession(path) {
        const session = await this.#session.getSession();
        if (!path &&
            !session) {
            await this.#conitinueSession();
        }
        if (path &&
            !session) {
            await this.#restoreSession(path);
        }
        if (session &&
            path &&
            session.sessionManager.getSessionFile() !== path) {
            await this.#restoreSession(path);
        }
        const s = await this.#session.getSession();
        return s;
    }
    async newSession() {
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
class PiChat {
    cwd;
    #manager;
    // ACTIONS
    #actions = new PQueue({ concurrency: 1 });
    // PI CHANGE EVENT
    #piEventListeners = [];
    // SESSON CHANGE EVENT
    #sessionChangeListeners = [];
    constructor(cwd) {
        this.cwd = cwd;
        this.#manager = new PiChatSessionManager(cwd, this.#onSessionChange, this.#onPiEvent);
    }
    async #message(prompt, sessionPath) {
        const session = await this.#manager.getSession(sessionPath);
        session.prompt(prompt);
    }
    #onSessionChange(name, path) {
        this.#sessionChangeListeners.forEach(l => l(name || "", path || ""));
    }
    #onPiEvent = (event) => {
        this.#piEventListeners.forEach(l => l(event));
    };
    queueAction(action) {
        this.#actions.add(async () => {
            switch (action.event) {
                case "message":
                    this.#message(action.args.prompt, action.args.sessionPath);
                    break;
                case "newSession":
                    this.#manager.newSession();
                    break;
            }
        });
    }
    addOnSessionChangeListener(onSessionChange) {
        this.#sessionChangeListeners.push(onSessionChange);
    }
    addPiEventListener(l) {
        this.#piEventListeners.push(l);
    }
}
export { PiChat, };
//# sourceMappingURL=lifeCycleManager.js.map