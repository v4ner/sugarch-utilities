import { ActivityInfo, ActivityTriggerMode } from '@sugarch/bc-mod-types';
import { Globals, sleepUntil } from '@sugarch/bc-mod-utility';
import { version } from './package';
import { ChatMessageTools } from './tools';

type EventMode = ActivityTriggerMode;

type EventArgType = [sender: Character, player: PlayerCharacter, info: ActivityInfo];

type Handler = {
    mode: EventMode;
    activity: string | null;
    listener: (...args: EventArgType) => void;
    once: boolean;
};

type HandlerRunner = (modeFilter: Set<EventMode>, activityName: string, ...args: EventArgType) => void;

const modesFilters = {
    OthersOnSelf: new Set<EventMode>(['OthersOnSelf', 'AnyOnSelf', 'SelfInvolved', 'AnyInvolved']),
    SelfOnSelf: new Set<EventMode>(['SelfOnSelf', 'AnyOnSelf', 'SelfInvolved', 'AnyInvolved']),
    SelfOnOthers: new Set<EventMode>(['SelfOnOthers', 'SelfInvolved', 'AnyInvolved']),
    OthersOnOthers: new Set<EventMode>(['AnyInvolved']),
} as const;

/**
 * Create a chat room message handler for activity events
 * @returns A configured chat room message handler
 */
function makeChatRoomMsgHandler (runner: HandlerRunner): ChatRoomMessageHandler {
    return {
        Description: `SugarChain Activity Handler v${version}`,
        Priority: 290, // must be between 210 (arousal processing) and 300 (sensory deprivation)
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Callback: (data, sender, msg, metadata) => {
            const info = ChatMessageTools.pullActivityInfo(data, sender, msg, metadata); // Pull activity info for later use
            if (!info) return false; // If no activity info, return false

            const mode: Set<EventMode> = (() => {
                if (info.TargetCharacter === Player.MemberNumber) {
                    if (sender.MemberNumber === info.TargetCharacter) return modesFilters.SelfOnSelf ;
                    return modesFilters.OthersOnSelf;
                } else if (info.SourceCharacter === Player.MemberNumber) return modesFilters.SelfOnOthers;
                else return modesFilters.OthersOnOthers;
            })();

            runner(mode, info.ActivityName, sender, Player, info);
            return false;
        },
    };
}

class _ActivityEvents<T extends string = ActivityName> {
    private _handlers: Handler[] = [];

    constructor () {
        (async () => {
            await sleepUntil(() => Array.isArray(ChatRoomMessageHandlers));
            ChatRoomRegisterMessageHandler(makeChatRoomMsgHandler((...args) => this.emit(...args)));
        })();
    }

    private emit (modeFilter: Set<EventMode>, activityName: string, ...args: EventArgType) {
        const cpListeners: Handler[] = [...this._handlers];
        const nHandlers: Handler[] = [];

        for (const handler of cpListeners) {
            if ((handler.activity === null || activityName === handler.activity) && modeFilter.has(handler.mode)) {    
                // If activity is null, it matches any activity
                // Otherwise, it must match the specific activity name
                try {
                    handler.listener(...args);
                } catch (e) {
                    console.error(`Error in activity event listener for ${handler.activity} (${handler.mode}):`, e);
                }

                if (!handler.once) {
                    nHandlers.push(handler);
                }
            } else {
                nHandlers.push(handler);
            }
        }

        // Update handlers after iteration
        this._handlers = nHandlers;
    }

    /**
     * Register an event listener
     * @param mode - The event mode to listen to
     * @param activity - The activity name to listen to
     * @param listener - The listener function
     */
    on<U extends EventMode> (mode: U, activity: T, listener: (...args: EventArgType) => void): void {
        this._handlers.push({ mode, activity, listener, once: false });
    }

    /**
     * Register a one-time event listener
     * @param mode - The event mode to listen to
     * @param activity - The activity name to listen to
     * @param listener - The listener function
     */
    once<U extends EventMode> (mode: U, activity: T, listener: (...args: EventArgType) => void): void {
        this._handlers.push({ mode, activity, listener, once: true });
    }

    /**
     * Register an event listener, regardless of specific activity
     * @param mode - The event mode to listen to
     * @param listener - The listener function
     */
    onAny<U extends EventMode> (mode: U, listener: (...args: EventArgType) => void): void {
        this._handlers.push({ mode, activity: null, listener, once: false });
    }

    /**
     * Register a one-time event listener, regardless of specific activity
     * @param mode - The event mode to listen to
     * @param listener - The listener function
     */
    onceAny<U extends EventMode> (mode: U, listener: (...args: EventArgType) => void): void {
        this._handlers.push({ mode, activity: null, listener, once: true });
    }

    /**
     * Unregister an event listener
     * If the listener is undefined, all handlers for the specified mode and activity will be removed.
     * @param mode - The event mode to stop listening to
     * @param activity - The activity name to stop listening to, or `null` to remove the listener that is not specific to any activity
     * @param listener - The listener function (optional)
     */
    off<U extends EventMode> (mode: U, activity: T | null, listener?: (...args: EventArgType) => void): void {
        if (!listener) {
            // Remove all handlers for the specified mode and activity
            this._handlers = this._handlers.filter(handler => handler.mode !== mode || handler.activity !== activity);
        } else {
            // Remove only the specified listener
            this._handlers = this._handlers.filter(
                handler => handler.mode !== mode || handler.activity !== activity || handler.listener !== listener
            );
        }
    }
}

/**
 * Chat handler events emitter, this event is emitted from a message handler in the last process order.
 * Thus hidden messages, either by filter setting or sensory deprivation, will not be emitted.
 *
 * The version number is used to ensure that different versions of the global variable are independent.
 */
export const ActivityEvents = Globals.get(`ActivityEvents@${version}`, () => new _ActivityEvents());
