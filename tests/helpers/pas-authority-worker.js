"use strict";

const { parentPort, workerData } = require("worker_threads");
const { PaymentAuthority } = require("../../pas/authority");

const authority = new PaymentAuthority(workerData.filename);
const barrier = new Int32Array(workerData.barrier);
parentPort.postMessage({ ready: true });
Atomics.wait(barrier, 0, 0);
Atomics.add(barrier, 1, 1);
Atomics.notify(barrier, 1);
const result = authority.confirmPayment(workerData.command);
authority.close();
parentPort.postMessage({ result });
