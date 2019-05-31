'use strict';

import { Logger, MainInstance, PublisherModel, Subscription, SubscriptionModel, SubscriptionProtocol } from 'enqueuer-plugins-template';
import { HttpContainerPool } from 'enqueuer/js/pools/http-container-pool';
import * as _ from 'lodash';
import * as soap from 'soap';
import { open_wsdl } from 'soap/lib/wsdl';
import { SoapPublisher } from './soap-publisher';


interface Message {
    body: any;
    headers: any;
}

export class SoapSubscription extends Subscription {
    private readonly proxy: boolean;
    private sendResults?: any;
    private secureServer: boolean;
    private httpServer: any;

    constructor(subscription: SubscriptionModel) {
        super(subscription);

        this.type = this.type.toLowerCase();
        this.secureServer = this.isSecureServer();
        this.proxy = this.isProxyServer();
    }

    public async subscribe(): Promise<void> {
        try {
            this.httpServer = await HttpContainerPool.getApp(this.port, this.secureServer, this.credentials);
        } catch (error) {
            const message = `Error in ${this.type} subscription: ${error}`;
            Logger.error(message);
            throw new Error(message);
        }
    }

    public unsubscribe(): Promise<void> {
        return HttpContainerPool.releaseApp(this.port);
    }

    public async receiveMessage(): Promise<any> {
        const wsdl = await this.loadWsdl();
        return new Promise((resolve, reject) => {
            const soapServer = soap.listen(this.httpServer, {
                path: this.endpoint,
                services: this.createServiceHandler(resolve, reject),
                xml: wsdl
            });
            if (this.headers) {
                soapServer.addSoapHeader(() => {
                    Logger.debug(`Adding headers: ${JSON.stringify(this.headers)}`);
                    return this.headers;
                });
            }
        });
    }

    public async sendResponse(): Promise<void> {
        Logger.trace(`${this.type} sending response: ${JSON.stringify(this.response)}`);
        try {
            this.sendResults(this.response);
            Logger.debug(`${this.type} response sent`);
        } catch (err) {
            throw new Error(`${this.type} response back sending error: ${err}`);
        }
    }

    private createServiceHandler(messageReceived: (message: any) => void, errorReceived: (error: any) => void) {
        const serviceHandler = _.set({}, `${this.service}.${this.port}.${this.function}`,
            (args: any, headers: any) => {
                return new Promise<any>((resolve, reject) => {
                    Logger.debug(`${this.type}:${this.port} got hit (${this.service}.${this.port}.${this.function}) with args: ${JSON.stringify(args)}`);
                    try {
                        const message = this.createMessageReceivedStructure(args, headers);
                        this.sendResults = resolve;
                        if (this.proxy) {
                            this.callThroughProxy(message, messageReceived, errorReceived);
                        } else {
                            messageReceived(message);
                        }
                    } catch (error) {
                        errorReceived(error);
                    }
                });
            });
        return serviceHandler;
    }

    private async callThroughProxy(message: Message, mesageReceived: (message: any) => void, errorReceived: (error: any) => void) {
        try {
            this.response = await this.redirectCall(message);
            Logger.trace(`${this.type}:${this.port} got redirection response: ${JSON.stringify(this.response, null, 2)}`);
            mesageReceived(message);
        } catch (err) {
            errorReceived(err);
        }
    }

    private loadWsdl() {
        return new Promise<string>((resolve, reject) => {
            open_wsdl(this.wsdlLocation, (error, wsdl) => {
                if (error) {
                    return reject(error);
                }
                resolve(wsdl.toXML());
            });
        });
    }

    private createMessageReceivedStructure(args: any, headers: any): Message {
        return {
            body: args,
            headers: headers
        };
    }

    private async redirectCall(message: Message): Promise<any> {
        const config: PublisherModel = {
            headers: message.headers,
            name: this.name,
            options: {
                endpoint: this.redirect
            },
            payload: message.body,
            service: this.service,
            target: this.target,
            timeout: this.timeout,
            type: this.type,
            wsdlLocation: this.wsdlLocation
        };

        const soapPublisher = new SoapPublisher(config);
        Logger.info(`Redirecting call from ${this.endpoint} (${this.port}) to ${this.redirect}`);
        return await soapPublisher.publish();
    }

    private isSecureServer(): boolean {
        if (this.type) {
            if (this.type.indexOf('https') !== -1) {
                return true;
            } else if (this.type.indexOf('http') !== -1) {
                return false;
            }
        }
        throw new Error(`Http server type is not known: ${this.type}`);
    }

    private isProxyServer(): boolean {
        if (this.type) {
            return this.type.indexOf('proxy') !== -1;
        }
        throw new Error(`Http server type is not known: ${this.type}`);
    }
}

export function entryPoint(mainInstance: MainInstance): void {
    const soapProtocol = new SubscriptionProtocol('soap',
        (subscriptionModel: SubscriptionModel) => new SoapSubscription(subscriptionModel),
        ['headers', 'body'])
        .addAlternativeName('soap-proxy', 'soap-server')
        .setLibrary('soap') as SubscriptionProtocol;
    mainInstance.protocolManager.addProtocol(soapProtocol);
}