'use strict';
import { Logger, MainInstance, Publisher, PublisherModel, PublisherProtocol } from 'enqueuer-plugins-template';
import * as _ from 'lodash';
import * as soap from 'soap';
import * as util from 'util';
import { SoapSecurityFactory } from './security-factory';

export interface SoapTarget {
    service: string;
    port: string;
    operation: string;
}

export class SoapPublisher extends Publisher {
    private headers: any;
    private timeout: any;
    private target: SoapTarget;
    private requestOptions: any;

    constructor(publisher: PublisherModel) {
        super(publisher);

        this.payload = this.payload || '';
        this.headers = this.headers || {};
        this.timeout = this.timeout || 3000;
        this.requestOptions = _.defaults(this.requestOptions || {}, { timeout: this.timeout });
    }

    public async publish(): Promise<any> {
        if (!this.target || !this.target.service || !this.target.port || !this.target.operation) {
            throw new Error('Invalid soap target');
        }
        const client = await this.createClient();
        const soapMethod = _.get(client, `${this.target.service}.${this.target.port}.${this.target.operation}`);
        if (!soapMethod) {
            throw new Error('Can not tind a soap method to call. Please verify your publisher configuration.');
        }
        const result = await util.promisify(soapMethod)(this.payload, this.requestOptions, this.headers);
        return result;
    }

    private async createClient() {
        const client: soap.Client = await soap.createClientAsync(this.wsdlLocation, this.options);
        if (this.security) {
            const clientSecurity = new SoapSecurityFactory().create(this.security);
            client.setSecurity(clientSecurity);
        }
        client.on('request', (xml, eid) => {
            Logger.debug(`Soap request sent: ${xml}, to exchange id: ${eid}`);
        });
        client.on('response', (body, response, eid) => {
            Logger.debug(`Soap response received: ${JSON.stringify(response)}. exchange id: ${eid}`);
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
