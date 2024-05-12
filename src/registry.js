export class Registry {
    constructor() {
        this.counter = 0;
        this.keys = [];
        this.futures = {};
    }

    store(future) {
        let key;
        if (this.keys.length === 0) {
            key = this.counter++;
        } else {
            key = this.keys.pop();
        }
        this.futures[key] = future;
        return key;
    }

    retrieve(key) {
        return this.#pop(key);
    }

    clear() {
        const keys = Object.keys(this.futures);
        for (const key of keys) {
            const future = this.#pop(key);
            future.cancel('Client disconnected');
        }
    }

    #pop(key) {
        if (!(key in this.futures)) {
            throw new Error(`Future key ${key} does not exist`);
        }
        const future = this.futures[key];
        delete this.futures[key];
        this.keys.push(key);
        return future;
    }
}
