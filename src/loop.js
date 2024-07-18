/*
 * Copyright (c) 2024 Marcelo Hashimoto
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import { AbstractError } from './types';

export class CancelledError extends AbstractError {
    constructor(message) {
        super(message, 'CancelledError');
    }
}

export class Loop {
    createFuture() {
        let pending;
        let setResult;
        let setException;

        const future = new Promise((resolve, reject) => {
            pending = true;
            setResult = resolve;
            setException = reject;
        });

        future.setResult = (result) => {
            if (pending) {
                pending = false;
                setResult(result);
            }
        };

        future.setException = (exception) => {
            if (pending) {
                pending = false;
                setException(exception);
            }
        };

        future.cancel = (message) => {
            if (pending) {
                pending = false;
                setException(new CancelledError(message));
            }
        };

        return future;
    }
}

export default new Loop();
