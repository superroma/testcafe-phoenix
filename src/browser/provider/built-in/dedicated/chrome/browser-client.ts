import { Dictionary } from '../../../../../configuration/interfaces';
import Protocol from 'devtools-protocol';
import path from 'path';
import os from 'os';
import remoteChrome from 'chrome-remote-interface';
import { GET_WINDOW_DIMENSIONS_INFO_SCRIPT } from '../../../utils/client-functions';

import {
    Config,
    RuntimeInfo,
    TouchConfigOptions,
    Size
} from './interfaces';

const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');

export class BrowserClient {
    private _clients: Dictionary<remoteChrome.ProtocolApi> = {};
    private _runtimeInfo: RuntimeInfo;
    private _parentTarget?: remoteChrome.TargetInfo;

    public constructor (runtimeInfo: RuntimeInfo) {
        this._runtimeInfo = runtimeInfo;

        runtimeInfo.browserClient = this;
    }

    private get _clientKey (): string {
        return this._runtimeInfo.activeWindowId || this._runtimeInfo.browserId;
    }

    private get _config (): Config {
        return this._runtimeInfo.config;
    }

    private async _getTabs (): Promise<remoteChrome.TargetInfo[]> {
        const tabs = await remoteChrome.listTabs({ port: this._runtimeInfo.cdpPort });

        return tabs.filter(t => t.type === 'page');
    }

    private async _getActiveTab (): Promise<remoteChrome.TargetInfo> {
        let tabs = await this._getTabs();

        if (this._runtimeInfo.activeWindowId)
            tabs = tabs.filter(t => t.title.includes(this._runtimeInfo.activeWindowId));

        return tabs[0];
    }

    private async _createClient (): Promise<remoteChrome.ProtocolApi | null> {
        try {
            const target                     = await this._getActiveTab();
            const client                     = await remoteChrome({ target, port: this._runtimeInfo.cdpPort });
            const { Page, Network, Runtime } = client;

            this._clients[this._clientKey] = client;

            await Page.enable();
            await Network.enable({});
            await Runtime.enable();

            return client;
        }
        catch (err) {
            return null;
        }
    }

    private async _setupClient (client: remoteChrome.ProtocolApi): Promise<void> {
        if (this._config.emulation)
            await this._setEmulation(client);

        if (this._config.headless)
            await this._setupDownloads(client);
    }

    private async _setDeviceMetricsOverride (client: remoteChrome.ProtocolApi, width: number, height: number, deviceScaleFactor: number, mobile: boolean): Promise<void> {
        await client.Emulation.setDeviceMetricsOverride({
            width,
            height,
            deviceScaleFactor,
            mobile,
            // @ts-ignore
            fitWindow: false
        });
    }

    private async _setUserAgentEmulation (client: remoteChrome.ProtocolApi): Promise<void> {
        if (this._config.userAgent === void 0)
            return;

        await client.Network.setUserAgentOverride({ userAgent: this._config.userAgent });
    }

    private async _setTouchEmulation (client: remoteChrome.ProtocolApi): Promise<void> {
        if (this._config.touch === void 0)
            return;

        const touchConfig: TouchConfigOptions = {
            enabled:        this._config.touch,
            configuration:  this._config.mobile ? 'mobile' : 'desktop',
            maxTouchPoints: 1
        };

        if (client.Emulation.setEmitTouchEventsForMouse)
            await client.Emulation.setEmitTouchEventsForMouse(touchConfig);

        if (client.Emulation.setTouchEmulationEnabled)
            await client.Emulation.setTouchEmulationEnabled(touchConfig);
    }

    private async _setEmulation (client: remoteChrome.ProtocolApi): Promise<void> {
        await this._setUserAgentEmulation(client);
        await this._setTouchEmulation(client);

        await this.resizeWindow({
            width:  this._config.width,
            height: this._config.height
        });
    }

    private async _setupDownloads (client: remoteChrome.ProtocolApi): Promise<void> {
        await client.Page.setDownloadBehavior({
            behavior:     'allow',
            downloadPath: DOWNLOADS_DIR
        });
    }

    private async _evaluateRuntime (client: remoteChrome.ProtocolApi, expression: string, returnByValue: boolean = false): Promise<Protocol.Runtime.EvaluateResponse> {
        return client.Runtime.evaluate({ expression, returnByValue });
    }

    private async _calculateEmulatedDevicePixelRatio (client: remoteChrome.ProtocolApi): Promise<void> {
        const devicePixelRatioQueryResult = await client.Runtime.evaluate({ expression: 'window.devicePixelRatio' });

        this._runtimeInfo.originalDevicePixelRatio = devicePixelRatioQueryResult.result.value;
        this._runtimeInfo.emulatedDevicePixelRatio = this._config.scaleFactor || this._runtimeInfo.originalDevicePixelRatio;
    }

    public async resizeWindow (newDimensions: Size): Promise<void> {
        const { browserId, config, viewportSize, providerMethods, emulatedDevicePixelRatio } = this._runtimeInfo;

        const currentWidth = viewportSize.width;
        const currentHeight = viewportSize.height;
        const newWidth = newDimensions.width || currentWidth;
        const newHeight = newDimensions.height || currentHeight;

        if (!config.headless)
            await providerMethods.resizeLocalBrowserWindow(browserId, newWidth, newHeight, currentWidth, currentHeight);

        viewportSize.width = newWidth;
        viewportSize.height = newHeight;

        const client = await this.getActiveClient();

        if (config.emulation) {
            await this._setDeviceMetricsOverride(client, viewportSize.width, viewportSize.height, emulatedDevicePixelRatio, config.mobile);

            await client.Emulation.setVisibleSize({ width: viewportSize.width, height: viewportSize.height });
        }
    }

    public isHeadlessTab (): boolean {
        return !!this._parentTarget && this._config.headless;
    }

    public async getActiveClient (): Promise<remoteChrome.ProtocolApi> {
        let client = this._clients[this._clientKey];

        if (client)
            return client;

        client = await this._createClient() as remoteChrome.ProtocolApi;

        return client;
    }

    public async init (): Promise<void> {
        try {
            const tabs = await this._getTabs();

            this._parentTarget = tabs.find(t => t.url.includes(this._runtimeInfo.browserId));

            if (!this._parentTarget)
                return;

            const client = await this._createClient() as remoteChrome.ProtocolApi;

            await this._calculateEmulatedDevicePixelRatio(client);
            await this._setupClient(client);
        }
        catch (e) {
            return;
        }
    }

    public async getScreenshotData (fullPage?: boolean): Promise<Buffer> {
        let viewportWidth  = 0;
        let viewportHeight = 0;

        const { config, emulatedDevicePixelRatio } = this._runtimeInfo;

        const client = await this.getActiveClient();

        if (fullPage) {
            const { contentSize, visualViewport } = await client.Page.getLayoutMetrics();

            await this._setDeviceMetricsOverride(
                client,
                Math.ceil(contentSize.width),
                Math.ceil(contentSize.height),
                emulatedDevicePixelRatio,
                config.mobile);

            viewportWidth = visualViewport.clientWidth;
            viewportHeight = visualViewport.clientHeight;
        }

        const screenshotData = await client.Page.captureScreenshot({});

        if (fullPage) {
            if (config.emulation) {
                await this._setDeviceMetricsOverride(
                    client,
                    config.width || viewportWidth,
                    config.height || viewportHeight,
                    emulatedDevicePixelRatio,
                    config.mobile);
            }
            else
                await client.Emulation.clearDeviceMetricsOverride();
        }

        return Buffer.from(screenshotData.data, 'base64');
    }

    public async closeTab (): Promise<void> {
        if (this._parentTarget)
            await remoteChrome.closeTab({ id: this._parentTarget.id, port: this._runtimeInfo.cdpPort });
    }

    public async updateMobileViewportSize (): Promise<void> {
        const client                      = await this.getActiveClient();
        const windowDimensionsQueryResult = await this._evaluateRuntime(client, `(${GET_WINDOW_DIMENSIONS_INFO_SCRIPT})()`, true);

        const windowDimensions = windowDimensionsQueryResult.result.value;

        this._runtimeInfo.viewportSize.width = windowDimensions.outerWidth;
        this._runtimeInfo.viewportSize.height = windowDimensions.outerHeight;
    }
}
