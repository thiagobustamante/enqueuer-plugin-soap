'use strict';
import debug from 'debug';
import { MainInstance, Publisher, PublisherModel, PublisherProtocol } from 'enqueuer-plugins-template';
import * as _ from 'lodash';
import * as soap from 'soap';
import { SoapSecurityFactory } from './security-factory';
import { SoapConfig } from './soap-config';

export class SoapPublisher extends Publisher {
    private headers: any;
    private timeout: any;
    private requestOptions: any;
    private soap: SoapConfig;
    private debugger = debug('Enqueuer:Plugin:Soap:Publisher');

    constructor(publisher: PublisherModel) {
        super(publisher);
        if (this.debugger.enabled) {
            this.debugger(`Creating new SOAP publihser <<%s>>. Configuration: %J`, this.name, _.omit(publisher, 'parent'));
        }

        this.soap = this.soap || {};
        this.payload = this.payload || '';
        this.headers = this.headers || {};
        this.timeout = this.timeout || 3000;
        this.requestOptions = _.defaults(this.requestOptions || {}, { timeout: this.timeout });
    }

    public async publish(): Promise<any> {
        if (!this.soap.service || !this.soap.port || !this.soap.operation) {
            throw new Error('Invalid soap target');
        }
        const client = await this.createClient();
        const soapMethod = _.get(client, `${this.soap.service}.${this.soap.port}.${this.soap.operation}`);
        if (!soapMethod) {
            throw new Error('Can not tind a soap method to call. Please verify your publisher configuration.');
        }
        if (this.debugger.enabled) {
            this.debugger(`%s. Sending soap request.Payload: %J. RequestOptions: %J. Headers: %J`, this.name, this.payload, this.requestOptions, this.headers);
        }
        const result = await this.callSoapMethod(soapMethod);
        if (this.debugger.enabled) {
            this.debugger(`%s. Received soap response: %J.`, this.name, result);
        }
        return result;
    }

    private callSoapMethod(soapMethod: any) {
        return new Promise<any>((resolve, reject) => {
            soapMethod(this.payload, this.requestOptions, this.headers, (err: any, result: any) => {
                this.debugger(`%s. Response received. Error: %o. Result: %o. `, this.name, err, result);
                if (err) {
                    return reject(err);
                }
                return resolve(result);
            });
        });
    }

    private async createClient() {
        if (this.debugger.enabled) {
            this.debugger(`%s. Creating SOAP client. WSDL: %s, with Options: %J.`, this.name, this.soap.wsdl, this.options);
        }
        const client: soap.Client = await soap.createClientAsync(this.soap.wsdl, this.options, this.endpoint);
        if (this.debugger.enabled) {
            this.debugger(`%s. SOAP client created: %j.`, this.name, client.describe());
        }

        if (this.security) {
            this.debugger(`%s. Configuring SOAP security for options: %J.`, this.name, this.security);
            const clientSecurity = new SoapSecurityFactory().create(this.security);
            client.setSecurity(clientSecurity);
        }
        client.on('request', (xml, eid) => {
            this.debugger('%s. Soap request sent: %s, to exchange id: %s', this.name, xml, eid);
        });
        client.on('response', (body, response, eid) => {
            this.debugger(`%s. Soap response received: %J. exchange id: %s`, this.name, response, eid);
        });
        return client;
    }
}

export function entryPoint(mainInstance: MainInstance): void {
    const soapProtocol = new PublisherProtocol('soap',
        (publisherModel: PublisherModel) => new SoapPublisher(publisherModel))
        .setLibrary('soap') as PublisherProtocol;
    mainInstance.protocolManager.addProtocol(soapProtocol);
}
