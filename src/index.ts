'use strict';

import { MainInstance } from 'enqueuer-plugins-template';
import * as publisher from './soap-publisher';
import * as subscription from './soap-subscription';

export function entryPoint(mainInstance: MainInstance): void {
    subscription.entryPoint(mainInstance);
    publisher.entryPoint(mainInstance);
}