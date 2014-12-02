
var inf = 2e999;
var serInf = "1.#INF";
var serNegInf = "-1.#INF";
var _serInf = inf.toString();
var _serNegInf = (-inf).toString();

function frexp (x) {
    var exp = 0;
    if (x < 0) {
        x = -x;
    }
    if (x < 0.5) {
        while (x < 0.5) {
            x *= 2;
            exp--;
        }
    } else if (x >= 1) {
        while (x >= 1) {
            x /= 2;
            exp++;
        }
    }
    return {
        m: x,
        e: exp
    }
}

function SerializeStringHelper(str) {
    var n = str.charCodeAt(0)
    if (n==0x1E) {
        return "\x7E\x7A";
    } else if (n<=0x20) {
        return "\x7E" + String.fromCharCode(n + 64);
    } else if (n==0x5E) {
        return "\x7E\x7D";
    } else if (n==0x7E) {
        return "\x7E\x7C";
    } else if (n==0x7F) {
        return "\x7E\x7B";
    } else {
        throw "error";
    }
}

function changeNumber(v) {
    var s = v.toString();
    if (s === _serInf) {
        return "1.#INF";
    } else if (s === _serNegInf) {
        return "-1.#INF";
    } else {
        return s;
    }
}

function SerializeValue(v, res, nres) {
    var t = typeof(v)

    if (t == "string") {
        res[nres+1] = "^S";
        res[nres+2] = v.replace(/[\x01-\x20\x5E\x7E\x7F]/g, SerializeStringHelper);
        nres+=2;
    } else if (t == "number") {
        var str = changeNumber(v);
        if (parseFloat(str) === v || str == serInf || str == serNegInf) {
            res[nres+1] = "^N";
            res[nres+2] = str;
            nres=nres+2;
        } else {
            var f = frexp(v);
            res[nres+1] = "^F";
            res[nres+2] = parseInt(f.m*Math.pow(2, 53));
            res[nres+3] = "^f"
            res[nres+4] = (f.e-53).toString();
            nres=nres+4;
        }
    } else if (t == "object" && v != null) {
        nres++;
        res[nres] = "^T";

        for (var k in v) {
            nres = SerializeValue((/^\d+$/.test(k)) ? (parseInt(k) + 1) : k, res, nres);
            nres = SerializeValue(v[k], res, nres);
        }

        nres++;
        res[nres] = "^t";

    } else if (t == "boolean") {
        nres++;
        res[nres] = v ? "^B" : "^b";
    } else if (t == "undefined" || v === null) {
        nres++;
        res[nres] = "^Z";
    } else {
        throw ": Cannot serialize a value of type '" + t.toString() + "'";
    }
    return nres;
}

function Serialize() {
    var nres = 0;
    var serializeTbl = [ "^1" ];

    for (var i = 0; i < arguments.length; i++) {
        var v = arguments[i];
        nres = SerializeValue(v, serializeTbl, nres);
    }
    serializeTbl[nres+1] = "^^";

    return serializeTbl.join("");
}

function gmatch(str, reg) {
    var result = str.match(reg);
    var index = -1;

    return function() {
        index++;
        if (!result[index]) {
            return
        } else {
            return {
                ctl: result[index].substr(0,2),
                data: result[index].substr(2)
            }
        }
    }
}

function DeserializeStringHelper(escape) {
    if (escape < "~\x7A") {
        return String.fromCharCode(escape.charCodeAt(2) - 64);
    } else if (escape == "~\x7A") {
        return "\x1E";
    } else if (escape == "~\x7B") {
        return "\x7F";
    } else if (escape == "~\x7C") {
        return "\x7E";
    } else if (escape == "~\x7D") {
        return "\x5E";
    } else {
        throw "DeserializeStringHelper got called for '" + escape + "'?!?";
    }
}

function DeserializeNumberHelper(number) {
    if (number == serNegInf) {
        return -inf;
    } else if (number == serInf) {
        return inf;
    } else {
        return number - 0;
    }
}

function DeserializeValue(iter, single, ctl, data) {
    if (!single) {
        var r = iter();
        ctl = r.ctl;
        data = r.data;
    }

    if (!ctl) {
        throw "Supplied data misses AceSerializer terminator ('^^')";
    }

    if (ctl == "^^") {
        return
    }

    var res
    if (ctl == "^S") {
        res = data.replace(/~./g, DeserializeStringHelper)
    } else if (ctl == "^N") {
        res = DeserializeNumberHelper(data);
        if (res == undefined) {
            throw "Invalid serialized number: '" + data + "'";
        }
    } else if (ctl == "^F") {
        var r = iter();
        if (r.ctl != "^f") {
            throw "Invalid serialized floating-point number, expected '^f', not '" + r + "'";
        }
        var m = parseInt(data);
        var e = parseInt(r.data);
        if (!(m && e)) {
            throw "Invalid serialized floating-point number, expected mantissa and exponent, got '" + tostring(m) + "' and '" + tostring(e) + "'";
        }
        res = m * Math.pow(2, e);
    } else if (ctl == "^B") {
        res = true;
    } else if (ctl == "^b") {
        res = false;
    } else if (ctl == "^Z") {
        res = null;
    } else if (ctl == "^T") {
        res = [];

        var k, v, r;
        while (true) {
            r = iter();
            if (r.ctl == "^t")
                break;

            k = DeserializeValue(iter, true, r.ctl, r.data);
            if (k === undefined) {
                throw "Invalid AceSerializer table format (no table end marker)";
            }
            if (typeof(k) == 'number')
                k--;

            r = iter();
            v = DeserializeValue(iter, true, r.ctl, r.data);
            if (v === undefined) {
                throw "Invalid AceSerializer table format (no table end marker)";
            }
            res[k] = v;
        }
    } else {
        throw "Invalid AceSerializer control code '" + ctl + "'";
    }

    return res;
}

function Deserialize(str) {
    str = str.replace(/[\x01-\x20\x7F]/g, "");

    var iter = gmatch(str, /(\^.)([^^]*)/g);
    var r = iter();

    if (r == null || r.ctl != "^1") {
        return;
    } 

    try {
        var result = [];
        var r;
        while (r = iter()) {
            var res = DeserializeValue(iter, true, r.ctl, r.data);
            if (res !== undefined) {
                result[result.length] = res;
            }
        }
        return result;
    } catch(e) {
        console.log(e)
        return;
    }
}

module.exports = {
    encode : Serialize,
    decode : Deserialize
}
