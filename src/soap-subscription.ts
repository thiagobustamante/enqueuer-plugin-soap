'use strict';

import debug from 'debug';
import { MainInstance, PublisherModel, Subscription, SubscriptionModel, SubscriptionProtocol } from 'enqueuer-plugins-template';
import { HttpContainerPool } from 'enqueuer/js/pools/http-container-pool';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as soap from 'soap';
import { SoapConfig } from './soap-config';
import { SoapPublisher } from './soap-publisher';


interface Message {
    body: any;
    headers: any;
}

export class SoapSubscription extends Subscription {
    private readonly proxy: boolean;
    private redirect: Message;
    private sendResults?: any;
    private secureServer: boolean;
    private httpServer: any;
    private soap: SoapConfig;
    private debugger = debug('Enqueuer:Plugin:Soap:Subscription');

    constructor(subscription: SubscriptionModel) {
        super(subscription);
        this.debugger(`Creating new SOAP subscription <<%s>>. Configuration: %J`, this.name, _.omit(subscription, 'parent'));
        this.soap = this.soap || {};
        this.type = this.type.toLowerCase();
        this.secureServer = this.isSecureServer();
        this.proxy = this.isProxyServer();
    }

    public async subscribe(): Promise<void> {
        try {
            this.httpServer = await HttpContainerPool.getApp(this.port, this.secureServer, this.credentials);
            this.httpServer.use((req: any, res: any, next: any) => {
                this.debugger(`%s got hit URL: %o`, this.name, req.url);
                this.debugger(`%s got hit with headers: %o`, this.name, req.headers);
                this.debugger(`%s got hit with body: %o`, this.name, req.rawBody);
                req.body = req.rawBody;
                next();
            });
            this.debugger(`%s: HTTP server listenning for soap requests on port: %d`, this.name, this.port);
        } catch (error) {
            const message = `Error in ${this.type} subscription: ${error}`;
            throw new Error(message);
        }
    }

    public unsubscribe(): Promise<void> {
        return HttpContainerPool.releaseApp(this.port);
    }

    public async receiveMessage(): Promise<any> {
        this.debugger(`%s. Creating server for the given wsdl: %j`, this.name, this.soap.wsdl);
        const wsdl = fs.readFileSync(this.soap.wsdl, 'utf8');
        return await Promise.resolve(new Promise((resolve, reject) => {
            const soapServer = soap.listen(this.httpServer, {
                callback: (err, server) => {
                    this.debugger(`%s. Soap server is ready`, this.name);
                },
                path: this.path || '/',
                services: this.createServiceHandler(resolve, reject),
                uri: this.soap.wsdl,
                xml: wsdl
            });
            if (this.headers) {
                soapServer.addSoapHeader(() => {
                    this.debugger(`%s. Adding headers: %J`, this.name, this.headers);
                    return this.headers;
                });
            }
        }));
    }

    public async sendResponse(): Promise<void> {
        this.debugger(`%s sending response: %J`, this.name, this.response);
        try {
            this.sendResults(this.response);
            this.debugger(`%s ${this.type} response sent`, this.name);
        } catch (err) {
            throw new Error(`${this.type} response back sending error: ${err}`);
        }
    }

    private createServiceHandler(messageReceived: (message: any) => void, errorReceived: (error: any) => void) {
        this.debugger('%s. Creating service handler for service [%s] port[%s] operation[%s].', this.name, this.soap.service, this.soap.port, this.soap.operation);
        const serviceHandler = _.set({}, `${this.soap.service}.${this.soap.port}.${this.soap.operation}`,
            (args: any, cb: any, headers: any) => {
                return new Promise<any>((resolve, reject) => {
                    try {
                        const message = this.createMessageReceivedStructure(args, headers);
                        this.sendResults = resolve;
                        if (this.proxy) {
                            this.redirect = message;
                            this.executeHookEvent('onOriginalMessageReceived', this.redirect);
                            this.callThroughProxy(this.redirect, messageReceived, errorReceived);
                        } else {
                            messageReceived(message);
                        }
                    } catch (error) {
                        errorReceived(error);
                    }
                });
            });
        this.debugger('%s. Service Handler created: %o.', this.name, serviceHandler);

        return serviceHandler;
    }

    private async callThroughProxy(message: Message, mesageReceived: (message: any) => void, errorReceived: (error: any) => void) {
        try {
            this.response = await this.redirectCall(message);
            this.debugger(`%s. ${this.type}:${this.port} got redirection response: %J`, this.name, this.response);
            mesageReceived(this.response);
        } catch (err) {
            this.debugger(`%s. ${this.type}:${this.port} got error response: %J`, this.name, err);
            errorReceived(err);
        }
    }

    private createMessageReceivedStructure(args: any, headers: any): Message {
        return {
            body: _.cloneDeep(args),
            headers: _.cloneDeep(headers || {})
        };
    }

    private async redirectCall(message: Message): Promise<any> {
        const config: PublisherModel = {
            headers: message.headers,
            name: this.name,
            options: {
                endpoint: this.endpoint
            },
            payload: message.body,
            soap: _.cloneDeep(this.soap),
            timeout: this.timeout,
            type: this.type
        };

        const soapPublisher = new SoapPublisher(config);
        this.debugger(`%s. Redirecting call from localhost:${this.port}(${this.path}) to ${this.endpoint}`, this.name);
        return await soapPublisher.publish();
    }

    private isSecureServer(): boolean {
        return (this.credentials ? true : false);
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
        {
            onMessageReceived: ['headers', 'body'],
            onOriginalMessageReceived: ['headers', 'body']
        })
        .addAlternativeName('soap-proxy', 'soap-server')
        .setLibrary('soap');
    mainInstance.protocolManager.addProtocol(soapProtocol);
}