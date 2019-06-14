'use strict';

import debug from 'debug';
import { MainInstance, Subscription, SubscriptionModel, SubscriptionProtocol } from 'enqueuer-plugins-template';
import { HttpContainerPool } from 'enqueuer/js/pools/http-container-pool';
import * as _ from 'lodash';
import * as soap from 'soap';
import { SoapConfig } from './soap-config';
// import { SoapPublisher } from './soap-publisher';


interface Message {
    body: any;
    headers: any;
}

export class SoapSubscription extends Subscription {
    // private readonly proxy: boolean;
    private sendResults?: any;
    private secureServer: boolean;
    private httpServer: any;
    private soap: SoapConfig;
    private debugger = debug('Enqueuer:Plugin:Soap:Subscription');

    constructor(subscription: SubscriptionModel) {
        super(subscription);
        if (this.debugger.enabled) {
            this.debugger(`Creating new SOAP subscription <<%s>>. Configuration: %J`, this.name, _.omit(subscription, 'parent'));
        }
        this.soap = this.soap || {};
        this.type = this.type.toLowerCase();
        this.secureServer = this.isSecureServer();
        // this.proxy = this.isProxyServer();
    }

    public async subscribe(): Promise<void> {
        try {
            this.httpServer = await HttpContainerPool.getApp(this.port, this.secureServer, this.credentials);
            this.httpServer.use((req: any, res: any, next: any) => {
                this.debugger(`Server hit with headers: %o`, req.headers);
                this.debugger(`Server hit with body: %o`, req);
                next();
            });
            this.debugger(`HTTP server listenning for soap requests on port: %d`, this.port);
        } catch (error) {
            const message = `Error in ${this.type} subscription: ${error}`;
            throw new Error(message);
        }
    }

    public unsubscribe(): Promise<void> {
        return HttpContainerPool.releaseApp(this.port);
    }

    public async receiveMessage(): Promise<any> {
        this.debugger(`Creating server for the given wsdl: %j`, this.soap.wsdl);
        return await Promise.resolve(new Promise((resolve, reject) => {
            const soapServer = soap.listen(this.httpServer, {
                callback: (err, server) => {
                    this.debugger(`Soap server is ready`);
                },
                path: this.path || '/',
                services: this.createServiceHandler(resolve, reject),
                xml: this.soap.wsdl
            });
            if (this.headers) {
                soapServer.addSoapHeader(() => {
                    this.debugger(`Adding headers: %J`, this.headers);
                    return this.headers;
                });
            }
        }));
    }

    public async sendResponse(): Promise<void> {
        this.debugger(`sending response: %J`, this.response);
        try {
            this.sendResults(this.response);
            this.debugger(`${this.type} response sent`);
        } catch (err) {
            throw new Error(`${this.type} response back sending error: ${err}`);
        }
    }

    private createServiceHandler(messageReceived: (message: any) => void, errorReceived: (error: any) => void) {
        this.debugger('Creating service handler for service [%s] port[%s] operation[%s].', this.soap.service, this.soap.port, this.soap.operation);
        const serviceHandler = _.set({}, `${this.soap.service}.${this.soap.port}.${this.soap.operation}`,
            (args: any) => {// headers: any
                this.debugger(`${this.type}:${this.port} got hit (${this.soap.service}.${this.soap.port}.${this.soap.operation}) with args: %J`, args);
                const message = this.createMessageReceivedStructure(args, {});
                messageReceived(message);
                return message;
                // return new Promise<any>((resolve, reject) => {
                //     try {
                //         const message = this.createMessageReceivedStructure(args, headers);
                //         this.sendResults = resolve;
                //         if (this.proxy) {
                //             this.callThroughProxy(message, messageReceived, errorReceived);
                //         } else {
                //             messageReceived(message);
                //         }
                //     } catch (error) {
                //         errorReceived(error);
                //     }
                // });
            });
        this.debugger('Service Handler created: %o.', serviceHandler);

        return serviceHandler;
    }

    // private async callThroughProxy(message: Message, mesageReceived: (message: any) => void, errorReceived: (error: any) => void) {
    //     try {
    //         this.response = await this.redirectCall(message);
    //         this.debugger(`${this.type}:${this.port} got redirection response: %J`, this.response);
    //         mesageReceived(message);
    //     } catch (err) {
    //         errorReceived(err);
    //     }
    // }

    private createMessageReceivedStructure(args: any, headers: any): Message {
        return {
            body: args,
            headers: headers
        };
    }

    // private async redirectCall(message: Message): Promise<any> {
    //     const config: PublisherModel = {
    //         headers: message.headers,
    //         name: this.name,
    //         options: {
    //             endpoint: this.redirect
    //         },
    //         payload: message.body,
    //         service: this.soap.service,
    //         soap: {
    //             wsdl: this.soap.wsdl
    //         },
    //         target: this.target,
    //         timeout: this.timeout,
    //         type: this.type
    //     };

    //     const soapPublisher = new SoapPublisher(config);
    //     this.debugger(`Redirecting call from ${this.path} (${this.soap.port}) to ${this.redirect}`);
    //     return await soapPublisher.publish();
    // }

    private isSecureServer(): boolean {
        return (this.credentials ? true : false);
    }

    // private isProxyServer(): boolean {
    //     if (this.type) {
    //         return this.type.indexOf('proxy') !== -1;
    //     }
    //     throw new Error(`Http server type is not known: ${this.type}`);
    // }
}

export function entryPoint(mainInstance: MainInstance): void {
    const soapProtocol = new SubscriptionProtocol('soap',
        (subscriptionModel: SubscriptionModel) => new SoapSubscription(subscriptionModel),
        ['headers', 'body'])
        .addAlternativeName('soap-proxy', 'soap-server')
        .setLibrary('soap') as SubscriptionProtocol;
    mainInstance.protocolManager.addProtocol(soapProtocol);
}