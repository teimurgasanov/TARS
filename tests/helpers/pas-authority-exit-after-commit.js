"use strict";

const { PaymentAuthority } = require("../../pas/authority");
const authority = new PaymentAuthority(process.argv[2]);
const result = authority.confirmPayment(JSON.parse(process.argv[3]));
// Abrupt process exit: no application response and no connection close/checkpoint.
process.exit(result.status === "CONFIRMED" ? 86 : 87);
