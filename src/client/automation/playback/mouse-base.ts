import hammerhead from '../deps/hammerhead';
import VisibleElementAutomation from './visible-element-automation';
import { DownState, MouseDownStateController } from './automation-states';
import { MouseOptions } from '../../../test-run/commands/options';
import { EnsureElementResult, EnsureElementResultArgs } from './interfaces';

// @ts-ignore
const Promise = hammerhead.Promise;
const extend = hammerhead.utils.extend;

export default class MouseBaseAutomation extends VisibleElementAutomation {
    private modifiers: unknown;

    protected ensureElementResultArgs?: EnsureElementResultArgs;
    protected downState: MouseDownStateController;

    public constructor (element: HTMLElement, mouseOptions: MouseOptions, eventArgs?: EnsureElementResultArgs, mouseDownState?: DownState) {
        super(element, mouseOptions);

        this.modifiers = mouseOptions.modifiers;

        this.ensureElementResultArgs = eventArgs;

        this.downState = MouseDownStateController.from(mouseDownState);
    }

    public run (useStrictElementCheck: boolean): Promise<unknown> {
        let promise = Promise.resolve();

        if (!this.ensureElementResultArgs) {
            promise = this._ensureElement(useStrictElementCheck, false, false)
                .then(({ element, clientPoint, screenPoint, devicePoint }: EnsureElementResult) => {
                    this.ensureElementResultArgs = {
                        point:       clientPoint,
                        screenPoint: screenPoint,
                        element:     element,
                        options:     extend({
                            clientX: clientPoint.x,
                            clientY: clientPoint.y,
                            screenX: devicePoint.x,
                            screenY: devicePoint.y
                        }, this.modifiers)
                    };
                });
        }

        return promise;
    }
}

