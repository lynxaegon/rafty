module.exports = class Timer {
    constructor(duration, callback) {
        this.id = 0;
        this.duration = duration;
        this.callback = callback;

        this._isRunning = false;
        this._type = 0;
    }

    isRunning() {
        return this._isRunning;
    }

    getDuration() {
        if(Array.isArray(this.duration)) {
            return Math.floor(Math.random() * (this.duration[1] - this.duration[0] + 1) + this.duration[0]);
        }
        return this.duration;
    }

    once() {
        this._type = 1;
        this._isRunning = true;
        this.id = setTimeout(() => {
            this.callback();
            this._isRunning = false;
        }, this.getDuration());
    }

    reset() {
        this.cancel();
        if(this._type == 1) {
            this.once();
        } else if(this._type == 2) {
            this.indefinite();
        }
    }

    indefinite() {
        this._type = 2;
        this._isRunning = true;
        this.id = setInterval(this.callback, this.getDuration());
    }

    cancel() {
        if(this._isRunning) {
            clearTimeout(this.id);
            clearInterval(this.id);
            this._isRunning = false;
        }
        return this;
    }
}