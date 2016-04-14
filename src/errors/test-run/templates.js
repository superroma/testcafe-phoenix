import dedent from 'dedent';
import { escape as escapeHtml } from 'lodash';
import TYPE from './type';

function markup (err, msgMarkup) {
    msgMarkup = dedent(msgMarkup);

    msgMarkup = dedent(`
        <span class="user-agent">${err.userAgent}</span>
        <span class="category">${err.category}</span>
    `) + msgMarkup;

    if (err.screenshotPath)
        msgMarkup += `\n\n<div class="screenshot-info"><strong>Screenshot:</strong> <a class="screenshot-path">${escapeHtml(err.screenshotPath)}</a></div>`;

    return msgMarkup;
}

export default {
    [TYPE.actionNumberOptionError]: err => markup(err, `
        Action option <code>${err.optionName}</code> is expected to be a number, but it was <code>${err.actualValue}</code>.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.actionPositiveNumberOptionError]: err => markup(err, `
        Action option <code>${err.optionName}</code> is expected to be a positive number, but it was <code>${err.actualValue}</code>.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.actionBooleanOptionError]: err => markup(err, `
        Action option <code>${err.optionName}</code> is expected to be a boolean value, but it was <code>${err.actualValue}</code>.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.uncaughtErrorOnPage]: err => markup(err, `
        Error on page <a href="${err.pageDestUrl}">${err.pageDestUrl}</a>:

        <code>${escapeHtml(err.errMsg)}</code>

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.uncaughtErrorInTestCode]: err => markup(err, `
        <code>${escapeHtml(err.errMsg)}</code>

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.uncaughtNonErrorObjectInTestCode]: err => markup(err, `
        Uncaught ${err.objType} "${escapeHtml(err.objStr)}" was thrown. Throw <code>Error</code> instead.
    `),

    [TYPE.actionSelectorTypeError]: err => markup(err, `
        Action selector is expected to be a string, but it was <code>${err.actualType}</code>.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.actionOptionsTypeError]: err => markup(err, `
        Action options is expected to be an object, null or undefined but it was <code>${err.actualType}</code>.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.actionElementNotFoundError]: err => markup(err, `
        The specified selector does not match any element in the DOM tree.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.actionElementIsInvisibleError]: err => markup(err, `
        The element that matches the specified selector is not visible.

        ${err.getCallsiteMarkup()}
    `),

    [TYPE.missingAwaitError]: err => markup(err, `
        A call to an async function is not awaited. Use the <code>await</code> keyword before actions, assertions or chains of them to ensure that they run in the right sequence.

        ${err.getCallsiteMarkup()}
    `)
};
