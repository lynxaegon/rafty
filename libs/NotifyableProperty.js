module.exports = (parent, name, defaultValue, onChange, options) => {
    options = options || {};
    return function (parent, name, defaultValue, onChange) {
        this._val = defaultValue == undefined ? null : defaultValue;
        onChange = onChange || (() => {});

        if(Array.isArray(this._val)) {
            const push = this._val.push
            this._val.push = (value) => {
                const event = {
                    property: name,
                    prev: null,
                    current: value
                };
                if(options.unique) {
                    if(this._val.indexOf(value) == -1) {
                        push.call(this._val, value);
                        onChange(event);
                    }
                } else {
                    push.call(this._val, value);
                    onChange(event);
                }
            };

            this._val.remove = (value, compareFnc) => {
                let found = false;
                if(compareFnc) {
                    for(let item of this._val) {
                        if(compareFnc(item)) {
                            value = item;
                            found = true;
                            break;
                        }
                    }
                } else {
                    found = true;
                }

                if(found) {
                    const event = {
                        property: name,
                        prev: value,
                        current: null
                    };

                    let idx = this._val.indexOf(value);
                    if (idx >= 0) {
                        this._val.splice(idx, 1);
                        onChange(event);
                    }
                }
            };
            return this._val;
        } else {
            Object.defineProperty(parent, name, {
                default: this._val,
                get: () => {
                    return this._val;
                },
                set: (value) => {
                    if (this._val == value)
                        return;

                    const event = {
                        property: name,
                        prev: this._val,
                        current: value
                    };
                    this._val = value;
                    onChange(event);
                }
            });
        }

        return parent[name];
    }.call({}, parent, name, defaultValue, onChange);
}