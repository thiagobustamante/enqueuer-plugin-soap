'use strict';

import * as fs from 'fs';
import * as soap from 'soap';

export interface SoapSecurity {
    basicAuth?: BasicAuthSecurity;
    bearer?: BearerSecurity;
    clientSSL?: ClientSSLSecurity;
    clientSSLPFX?: ClientSSLSecurityPFX;
    wsSecurity?: WSSecurity;
    wsSecurityCert?: WSSecurityCert;
    ntlm?: NTLMSecurity;
}

export interface BasicAuthSecurity {
    username: string;
    password: string;
}

export interface BearerSecurity {
    token: string;
}

export interface ClientSSLSecurity {
    key: string;
    cert: string;
    defaults?: any;
}

export interface ClientSSLSecurityPFX {
    pfx: string;
    defaults?: any;
}

export interface WSSecurity {
    username: string;
    password: string;
    options?: any;
}

export interface WSSecurityCert {
    publicKey: any;
    privateKey: string;
    options?: any;
    password?: any;
}

export interface NTLMSecurity {
    domain: any;
    password: any;
    username: any;
    workstation: any;

}

export class SoapSecurityFactory {

    public create(security: SoapSecurity) {
        if (security.basicAuth) {
            return this.createBasicAuthSecurity(security.basicAuth);
        }
        if (security.bearer) {
            return this.createBearerSecurity(security.bearer);
        }
        if (security.clientSSL) {
            return this.createClientSSLSecurity(security.clientSSL);
        }
        if (security.clientSSLPFX) {
            return this.createClientSSLSecurityPFX(security.clientSSLPFX);
        }
        if (security.wsSecurity) {
            return this.createWsSecurity(security.wsSecurity);
        }
        if (security.wsSecurityCert) {
            return this.createWsSecurityCert(security.wsSecurityCert);
        }
        if (security.ntlm) {
            return this.createNTLMSecurity(security.ntlm);
        }

        return null;
    }

    private createBasicAuthSecurity(security: BasicAuthSecurity) {
        return new soap.BasicAuthSecurity(security.username, security.password);
    }

    private createBearerSecurity(security: BearerSecurity) {
        return new soap.BearerSecurity(security.token);
    }

    private createClientSSLSecurity(security: ClientSSLSecurity) {
        return new soap.ClientSSLSecurity(security.key, security.cert, security.defaults);
    }

    private createClientSSLSecurityPFX(security: ClientSSLSecurityPFX) {
        return new soap.ClientSSLSecurityPFX(security.pfx, security.defaults);
    }

    private createWsSecurity(security: WSSecurity) {
        return new soap.WSSecurity(security.username, security.password, security.options);
    }

    private createWsSecurityCert(security: WSSecurityCert) {
        const privateKey = fs.readFileSync(security.privateKey);
        const publicKey = fs.readFileSync(security.publicKey);

        return new soap.WSSecurityCert(privateKey, publicKey, security.password, security.options);
    }

    private createNTLMSecurity(security: NTLMSecurity) {
        return new soap.NTLMSecurity(security);
    }
}