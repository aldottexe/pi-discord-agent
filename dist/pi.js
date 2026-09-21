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
        this.#session?.dispose();
        this.#session = s;
    }
}
class PiChatSessionManager {
    #session;
    #modelRuntime;
    cwd;
    #onSessionChange;
    #onPiEvent;
    #onError;
    constructor(cwd, onSessionChange, onPiEvent, onError) {
        this.cwd = cwd;
        this.#modelRuntime = ModelRuntime.create();
        this.#session = new PiChatSession();
        this.#onSessionChange = onSessionChange;
        this.#onPiEvent = onPiEvent;
        this.#onError = onError;
    }
    async #conitinueSession() {
        const { session: s } = await createAgentSession({
            sessionManager: SessionManager.continueRecent(process.cwd()),
            modelRuntime: await this.#modelRuntime,
        });
        if (!s.sessionFile) {
            const err = "restore session did not restore a session file";
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
    async #restoreSession(path) {
        let sm;
        try {
            sm = SessionManager.open(path);
        }
        catch (e) {
            const err = `creating new session, couldn't open requested: ${path}\n${e}`;
            process.stderr.write(err);
            this.#onError?.(err);
            sm = SessionManager.create(process.cwd());
        }
        const { session: s } = await createAgentSession({
            sessionManager: sm,
            modelRuntime: await this.#modelRuntime,
        });
        if (!s.sessionFile) {
            const err = "restore session did not restore a session file";
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
        if (!s.sessionFile) {
            const err = "couldn't make new session";
            this.#onError?.(err);
            throw new Error(err);
        }
        if (this.#onSessionChange)
            this.#onSessionChange({ name: s.sessionName, path: s.sessionFile });
        return s;
    }
}
class PiChat {
    cwd;
    #manager;
    // ACTIONS
    #actions = new PQueue({ concurrency: 1 });
    // PI EVENT
    #piEventListeners = [];
    // SESSON CHANGE EVENT
    #sessionChangeListeners = [];
    // ERROR EVENT
    #errorListeners = [];
    constructor(cwd) {
        this.cwd = cwd;
        this.#manager = new PiChatSessionManager(cwd, this.#onSessionChange, this.#onPiEvent, this.#onError);
    }
    async #message(prompt, sessionPath) {
        const session = await this.#manager.getSession(sessionPath);
        session.prompt(prompt);
        return session.sessionFile;
    }
    #onPiEvent = (event) => {
        this.#piEventListeners.forEach(l => l(event));
    };
    #onSessionChange = (session) => {
        this.#sessionChangeListeners.forEach(l => l(session));
    };
    #onError = (error) => {
        this.#errorListeners.forEach(l => l(error));
    };
    async newSession() {
        const session = await this.#manager.newSession();
        if (!session.sessionFile) {
            const err = "couldn't create new session";
            this.#onError?.(err);
            throw new Error(err);
        }
        return session.sessionFile;
    }
    queueAction(action) {
        this.#actions.add(async () => {
            switch (action.event) {
                case "message":
                    this.#message(action.args.prompt, action.args.sessionPath);
                    break;
            }
        });
    }
    addPiEventListener(l) {
        this.#piEventListeners.push(l);
    }
    addOnSessionChangeListener(onSessionChange) {
        this.#sessionChangeListeners.push(onSessionChange);
    }
    addOnErrorListener(onError) {
        this.#errorListeners.push(onError);
    }
}
export { PiChat };
//# sourceMappingURL=pi.js.map