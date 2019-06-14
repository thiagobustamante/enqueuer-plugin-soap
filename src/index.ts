'use strict';

import debug from 'debug';
import { MainInstance } from 'enqueuer-plugins-template';
import * as publisher from './soap-publisher';
import * as subscription from './soap-subscription';


debug.formatters.J = (v) => {
    return JSON.stringify(v, null, 2);
};

const tracer = debug('Enqueuer:Plugin:Soap');
export function entryPoint(mainInstance: MainInstance): void {
    tracer('Loading Enqueuer SOAP plugin');
    subscription.entryPoint(mainInstance);
    publisher.entryPoint(mainInstance);
    tracer('Enqueuer SOAP plugin loaded');
}