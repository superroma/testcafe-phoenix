import uiRoot from '../ui-root';

import { createElementFromDescriptor } from './utils/create-element-from-descriptor';
import { setStyles } from './utils/set-styles';

import { panel } from './descriptors';
import { PickButton } from './pick-button';
import { SelectorInputContainer } from './selector-input-container';
import { CopyButton } from './copy-button';
import { HideButton } from './hide-button';
import { elementPicker } from './element-picker';
import { MainContainer } from './main-container';

export default class SelectorInspectorPanel {
    element;
    elementPicker = elementPicker;

    constructor () {
        this.element = createElementFromDescriptor(panel);

        const pickButton             = new PickButton();
        const selectorInputContainer = new SelectorInputContainer();
        const copyButton             = new CopyButton(selectorInputContainer);
        const container              = new MainContainer(pickButton.element, selectorInputContainer.element, copyButton.element)
        const hideButton             = new HideButton(container.element);

        this.element.appendChild(container.element);
        this.element.appendChild(hideButton.element);
    }

    show () {
        if (!this.element.parentElement)
            uiRoot.insertFirstChildToPanelsContainer(this.element);

        setStyles(this.element, { display: 'flex' });
    }

    hide () {
        setStyles(this.element, { display: 'none' });
    }
}
