"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/jpeg-js/lib/decoder.js
var require_decoder = __commonJS({
  "node_modules/jpeg-js/lib/decoder.js"(exports2, module2) {
    var JpegImage = (function jpegImage() {
      "use strict";
      var dctZigZag = new Int32Array([
        0,
        1,
        8,
        16,
        9,
        2,
        3,
        10,
        17,
        24,
        32,
        25,
        18,
        11,
        4,
        5,
        12,
        19,
        26,
        33,
        40,
        48,
        41,
        34,
        27,
        20,
        13,
        6,
        7,
        14,
        21,
        28,
        35,
        42,
        49,
        56,
        57,
        50,
        43,
        36,
        29,
        22,
        15,
        23,
        30,
        37,
        44,
        51,
        58,
        59,
        52,
        45,
        38,
        31,
        39,
        46,
        53,
        60,
        61,
        54,
        47,
        55,
        62,
        63
      ]);
      var dctCos1 = 4017;
      var dctSin1 = 799;
      var dctCos3 = 3406;
      var dctSin3 = 2276;
      var dctCos6 = 1567;
      var dctSin6 = 3784;
      var dctSqrt2 = 5793;
      var dctSqrt1d2 = 2896;
      function constructor() {
      }
      function buildHuffmanTable(codeLengths, values) {
        var k = 0, code = [], i, j2, length = 16;
        while (length > 0 && !codeLengths[length - 1])
          length--;
        code.push({ children: [], index: 0 });
        var p = code[0], q;
        for (i = 0; i < length; i++) {
          for (j2 = 0; j2 < codeLengths[i]; j2++) {
            p = code.pop();
            p.children[p.index] = values[k];
            while (p.index > 0) {
              if (code.length === 0)
                throw new Error("Could not recreate Huffman Table");
              p = code.pop();
            }
            p.index++;
            code.push(p);
            while (code.length <= i) {
              code.push(q = { children: [], index: 0 });
              p.children[p.index] = q.children;
              p = q;
            }
            k++;
          }
          if (i + 1 < length) {
            code.push(q = { children: [], index: 0 });
            p.children[p.index] = q.children;
            p = q;
          }
        }
        return code[0].children;
      }
      function decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successivePrev, successive, opts) {
        var precision = frame.precision;
        var samplesPerLine = frame.samplesPerLine;
        var scanLines = frame.scanLines;
        var mcusPerLine = frame.mcusPerLine;
        var progressive = frame.progressive;
        var maxH = frame.maxH, maxV = frame.maxV;
        var startOffset = offset, bitsData = 0, bitsCount = 0;
        function readBit() {
          if (bitsCount > 0) {
            bitsCount--;
            return bitsData >> bitsCount & 1;
          }
          bitsData = data[offset++];
          if (bitsData == 255) {
            var nextByte = data[offset++];
            if (nextByte) {
              throw new Error("unexpected marker: " + (bitsData << 8 | nextByte).toString(16));
            }
          }
          bitsCount = 7;
          return bitsData >>> 7;
        }
        function decodeHuffman(tree) {
          var node = tree, bit;
          while ((bit = readBit()) !== null) {
            node = node[bit];
            if (typeof node === "number")
              return node;
            if (typeof node !== "object")
              throw new Error("invalid huffman sequence");
          }
          return null;
        }
        function receive(length) {
          var n2 = 0;
          while (length > 0) {
            var bit = readBit();
            if (bit === null) return;
            n2 = n2 << 1 | bit;
            length--;
          }
          return n2;
        }
        function receiveAndExtend(length) {
          var n2 = receive(length);
          if (n2 >= 1 << length - 1)
            return n2;
          return n2 + (-1 << length) + 1;
        }
        function decodeBaseline(component2, zz) {
          var t = decodeHuffman(component2.huffmanTableDC);
          var diff = t === 0 ? 0 : receiveAndExtend(t);
          zz[0] = component2.pred += diff;
          var k2 = 1;
          while (k2 < 64) {
            var rs = decodeHuffman(component2.huffmanTableAC);
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
              if (r < 15)
                break;
              k2 += 16;
              continue;
            }
            k2 += r;
            var z = dctZigZag[k2];
            zz[z] = receiveAndExtend(s);
            k2++;
          }
        }
        function decodeDCFirst(component2, zz) {
          var t = decodeHuffman(component2.huffmanTableDC);
          var diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
          zz[0] = component2.pred += diff;
        }
        function decodeDCSuccessive(component2, zz) {
          zz[0] |= readBit() << successive;
        }
        var eobrun = 0;
        function decodeACFirst(component2, zz) {
          if (eobrun > 0) {
            eobrun--;
            return;
          }
          var k2 = spectralStart, e = spectralEnd;
          while (k2 <= e) {
            var rs = decodeHuffman(component2.huffmanTableAC);
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
              if (r < 15) {
                eobrun = receive(r) + (1 << r) - 1;
                break;
              }
              k2 += 16;
              continue;
            }
            k2 += r;
            var z = dctZigZag[k2];
            zz[z] = receiveAndExtend(s) * (1 << successive);
            k2++;
          }
        }
        var successiveACState = 0, successiveACNextValue;
        function decodeACSuccessive(component2, zz) {
          var k2 = spectralStart, e = spectralEnd, r = 0;
          while (k2 <= e) {
            var z = dctZigZag[k2];
            var direction = zz[z] < 0 ? -1 : 1;
            switch (successiveACState) {
              case 0:
                var rs = decodeHuffman(component2.huffmanTableAC);
                var s = rs & 15, r = rs >> 4;
                if (s === 0) {
                  if (r < 15) {
                    eobrun = receive(r) + (1 << r);
                    successiveACState = 4;
                  } else {
                    r = 16;
                    successiveACState = 1;
                  }
                } else {
                  if (s !== 1)
                    throw new Error("invalid ACn encoding");
                  successiveACNextValue = receiveAndExtend(s);
                  successiveACState = r ? 2 : 3;
                }
                continue;
              case 1:
              // skipping r zero items
              case 2:
                if (zz[z])
                  zz[z] += (readBit() << successive) * direction;
                else {
                  r--;
                  if (r === 0)
                    successiveACState = successiveACState == 2 ? 3 : 0;
                }
                break;
              case 3:
                if (zz[z])
                  zz[z] += (readBit() << successive) * direction;
                else {
                  zz[z] = successiveACNextValue << successive;
                  successiveACState = 0;
                }
                break;
              case 4:
                if (zz[z])
                  zz[z] += (readBit() << successive) * direction;
                break;
            }
            k2++;
          }
          if (successiveACState === 4) {
            eobrun--;
            if (eobrun === 0)
              successiveACState = 0;
          }
        }
        function decodeMcu(component2, decode2, mcu2, row, col) {
          var mcuRow = mcu2 / mcusPerLine | 0;
          var mcuCol = mcu2 % mcusPerLine;
          var blockRow = mcuRow * component2.v + row;
          var blockCol = mcuCol * component2.h + col;
          if (component2.blocks[blockRow] === void 0 && opts.tolerantDecoding)
            return;
          decode2(component2, component2.blocks[blockRow][blockCol]);
        }
        function decodeBlock(component2, decode2, mcu2) {
          var blockRow = mcu2 / component2.blocksPerLine | 0;
          var blockCol = mcu2 % component2.blocksPerLine;
          if (component2.blocks[blockRow] === void 0 && opts.tolerantDecoding)
            return;
          decode2(component2, component2.blocks[blockRow][blockCol]);
        }
        var componentsLength = components.length;
        var component, i, j2, k, n;
        var decodeFn;
        if (progressive) {
          if (spectralStart === 0)
            decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
          else
            decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
        } else {
          decodeFn = decodeBaseline;
        }
        var mcu = 0, marker;
        var mcuExpected;
        if (componentsLength == 1) {
          mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
        } else {
          mcuExpected = mcusPerLine * frame.mcusPerColumn;
        }
        if (!resetInterval) resetInterval = mcuExpected;
        var h, v2;
        while (mcu < mcuExpected) {
          for (i = 0; i < componentsLength; i++)
            components[i].pred = 0;
          eobrun = 0;
          if (componentsLength == 1) {
            component = components[0];
            for (n = 0; n < resetInterval; n++) {
              decodeBlock(component, decodeFn, mcu);
              mcu++;
            }
          } else {
            for (n = 0; n < resetInterval; n++) {
              for (i = 0; i < componentsLength; i++) {
                component = components[i];
                h = component.h;
                v2 = component.v;
                for (j2 = 0; j2 < v2; j2++) {
                  for (k = 0; k < h; k++) {
                    decodeMcu(component, decodeFn, mcu, j2, k);
                  }
                }
              }
              mcu++;
              if (mcu === mcuExpected) break;
            }
          }
          if (mcu === mcuExpected) {
            do {
              if (data[offset] === 255) {
                if (data[offset + 1] !== 0) {
                  break;
                }
              }
              offset += 1;
            } while (offset < data.length - 2);
          }
          bitsCount = 0;
          marker = data[offset] << 8 | data[offset + 1];
          if (marker < 65280) {
            throw new Error("marker was not found");
          }
          if (marker >= 65488 && marker <= 65495) {
            offset += 2;
          } else
            break;
        }
        return offset - startOffset;
      }
      function buildComponentData(frame, component) {
        var lines = [];
        var blocksPerLine = component.blocksPerLine;
        var blocksPerColumn = component.blocksPerColumn;
        var samplesPerLine = blocksPerLine << 3;
        var R = new Int32Array(64), r = new Uint8Array(64);
        function quantizeAndInverse(zz, dataOut, dataIn) {
          var qt = component.quantizationTable;
          var v0, v1, v2, v3, v4, v5, v6, v7, t;
          var p = dataIn;
          var i2;
          for (i2 = 0; i2 < 64; i2++)
            p[i2] = zz[i2] * qt[i2];
          for (i2 = 0; i2 < 8; ++i2) {
            var row = 8 * i2;
            if (p[1 + row] == 0 && p[2 + row] == 0 && p[3 + row] == 0 && p[4 + row] == 0 && p[5 + row] == 0 && p[6 + row] == 0 && p[7 + row] == 0) {
              t = dctSqrt2 * p[0 + row] + 512 >> 10;
              p[0 + row] = t;
              p[1 + row] = t;
              p[2 + row] = t;
              p[3 + row] = t;
              p[4 + row] = t;
              p[5 + row] = t;
              p[6 + row] = t;
              p[7 + row] = t;
              continue;
            }
            v0 = dctSqrt2 * p[0 + row] + 128 >> 8;
            v1 = dctSqrt2 * p[4 + row] + 128 >> 8;
            v2 = p[2 + row];
            v3 = p[6 + row];
            v4 = dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128 >> 8;
            v7 = dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128 >> 8;
            v5 = p[3 + row] << 4;
            v6 = p[5 + row] << 4;
            t = v0 - v1 + 1 >> 1;
            v0 = v0 + v1 + 1 >> 1;
            v1 = t;
            t = v2 * dctSin6 + v3 * dctCos6 + 128 >> 8;
            v2 = v2 * dctCos6 - v3 * dctSin6 + 128 >> 8;
            v3 = t;
            t = v4 - v6 + 1 >> 1;
            v4 = v4 + v6 + 1 >> 1;
            v6 = t;
            t = v7 + v5 + 1 >> 1;
            v5 = v7 - v5 + 1 >> 1;
            v7 = t;
            t = v0 - v3 + 1 >> 1;
            v0 = v0 + v3 + 1 >> 1;
            v3 = t;
            t = v1 - v2 + 1 >> 1;
            v1 = v1 + v2 + 1 >> 1;
            v2 = t;
            t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
            v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
            v7 = t;
            t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
            v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
            v6 = t;
            p[0 + row] = v0 + v7;
            p[7 + row] = v0 - v7;
            p[1 + row] = v1 + v6;
            p[6 + row] = v1 - v6;
            p[2 + row] = v2 + v5;
            p[5 + row] = v2 - v5;
            p[3 + row] = v3 + v4;
            p[4 + row] = v3 - v4;
          }
          for (i2 = 0; i2 < 8; ++i2) {
            var col = i2;
            if (p[1 * 8 + col] == 0 && p[2 * 8 + col] == 0 && p[3 * 8 + col] == 0 && p[4 * 8 + col] == 0 && p[5 * 8 + col] == 0 && p[6 * 8 + col] == 0 && p[7 * 8 + col] == 0) {
              t = dctSqrt2 * dataIn[i2 + 0] + 8192 >> 14;
              p[0 * 8 + col] = t;
              p[1 * 8 + col] = t;
              p[2 * 8 + col] = t;
              p[3 * 8 + col] = t;
              p[4 * 8 + col] = t;
              p[5 * 8 + col] = t;
              p[6 * 8 + col] = t;
              p[7 * 8 + col] = t;
              continue;
            }
            v0 = dctSqrt2 * p[0 * 8 + col] + 2048 >> 12;
            v1 = dctSqrt2 * p[4 * 8 + col] + 2048 >> 12;
            v2 = p[2 * 8 + col];
            v3 = p[6 * 8 + col];
            v4 = dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048 >> 12;
            v7 = dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048 >> 12;
            v5 = p[3 * 8 + col];
            v6 = p[5 * 8 + col];
            t = v0 - v1 + 1 >> 1;
            v0 = v0 + v1 + 1 >> 1;
            v1 = t;
            t = v2 * dctSin6 + v3 * dctCos6 + 2048 >> 12;
            v2 = v2 * dctCos6 - v3 * dctSin6 + 2048 >> 12;
            v3 = t;
            t = v4 - v6 + 1 >> 1;
            v4 = v4 + v6 + 1 >> 1;
            v6 = t;
            t = v7 + v5 + 1 >> 1;
            v5 = v7 - v5 + 1 >> 1;
            v7 = t;
            t = v0 - v3 + 1 >> 1;
            v0 = v0 + v3 + 1 >> 1;
            v3 = t;
            t = v1 - v2 + 1 >> 1;
            v1 = v1 + v2 + 1 >> 1;
            v2 = t;
            t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
            v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
            v7 = t;
            t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
            v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
            v6 = t;
            p[0 * 8 + col] = v0 + v7;
            p[7 * 8 + col] = v0 - v7;
            p[1 * 8 + col] = v1 + v6;
            p[6 * 8 + col] = v1 - v6;
            p[2 * 8 + col] = v2 + v5;
            p[5 * 8 + col] = v2 - v5;
            p[3 * 8 + col] = v3 + v4;
            p[4 * 8 + col] = v3 - v4;
          }
          for (i2 = 0; i2 < 64; ++i2) {
            var sample2 = 128 + (p[i2] + 8 >> 4);
            dataOut[i2] = sample2 < 0 ? 0 : sample2 > 255 ? 255 : sample2;
          }
        }
        requestMemoryAllocation(samplesPerLine * blocksPerColumn * 8);
        var i, j2;
        for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
          var scanLine = blockRow << 3;
          for (i = 0; i < 8; i++)
            lines.push(new Uint8Array(samplesPerLine));
          for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
            quantizeAndInverse(component.blocks[blockRow][blockCol], r, R);
            var offset = 0, sample = blockCol << 3;
            for (j2 = 0; j2 < 8; j2++) {
              var line = lines[scanLine + j2];
              for (i = 0; i < 8; i++)
                line[sample + i] = r[offset++];
            }
          }
        }
        return lines;
      }
      function clampTo8bit(a) {
        return a < 0 ? 0 : a > 255 ? 255 : a;
      }
      constructor.prototype = {
        load: function load(path) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", path, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = (function() {
            var data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
            this.parse(data);
            if (this.onload)
              this.onload();
          }).bind(this);
          xhr.send(null);
        },
        parse: function parse(data) {
          var maxResolutionInPixels = this.opts.maxResolutionInMP * 1e3 * 1e3;
          var offset = 0, length = data.length;
          function readUint16() {
            var value = data[offset] << 8 | data[offset + 1];
            offset += 2;
            return value;
          }
          function readDataBlock() {
            var length2 = readUint16();
            var array = data.subarray(offset, offset + length2 - 2);
            offset += array.length;
            return array;
          }
          function prepareComponents(frame2) {
            var maxH2 = 1, maxV2 = 1;
            var component2, componentId2;
            for (componentId2 in frame2.components) {
              if (frame2.components.hasOwnProperty(componentId2)) {
                component2 = frame2.components[componentId2];
                if (maxH2 < component2.h) maxH2 = component2.h;
                if (maxV2 < component2.v) maxV2 = component2.v;
              }
            }
            var mcusPerLine = Math.ceil(frame2.samplesPerLine / 8 / maxH2);
            var mcusPerColumn = Math.ceil(frame2.scanLines / 8 / maxV2);
            for (componentId2 in frame2.components) {
              if (frame2.components.hasOwnProperty(componentId2)) {
                component2 = frame2.components[componentId2];
                var blocksPerLine = Math.ceil(Math.ceil(frame2.samplesPerLine / 8) * component2.h / maxH2);
                var blocksPerColumn = Math.ceil(Math.ceil(frame2.scanLines / 8) * component2.v / maxV2);
                var blocksPerLineForMcu = mcusPerLine * component2.h;
                var blocksPerColumnForMcu = mcusPerColumn * component2.v;
                var blocksToAllocate = blocksPerColumnForMcu * blocksPerLineForMcu;
                var blocks = [];
                requestMemoryAllocation(blocksToAllocate * 256);
                for (var i2 = 0; i2 < blocksPerColumnForMcu; i2++) {
                  var row = [];
                  for (var j3 = 0; j3 < blocksPerLineForMcu; j3++)
                    row.push(new Int32Array(64));
                  blocks.push(row);
                }
                component2.blocksPerLine = blocksPerLine;
                component2.blocksPerColumn = blocksPerColumn;
                component2.blocks = blocks;
              }
            }
            frame2.maxH = maxH2;
            frame2.maxV = maxV2;
            frame2.mcusPerLine = mcusPerLine;
            frame2.mcusPerColumn = mcusPerColumn;
          }
          var jfif = null;
          var adobe = null;
          var pixels = null;
          var frame, resetInterval;
          var quantizationTables = [], frames = [];
          var huffmanTablesAC = [], huffmanTablesDC = [];
          var fileMarker = readUint16();
          var malformedDataOffset = -1;
          this.comments = [];
          if (fileMarker != 65496) {
            throw new Error("SOI not found");
          }
          fileMarker = readUint16();
          while (fileMarker != 65497) {
            var i, j2, l;
            switch (fileMarker) {
              case 65280:
                break;
              case 65504:
              // APP0 (Application Specific)
              case 65505:
              // APP1
              case 65506:
              // APP2
              case 65507:
              // APP3
              case 65508:
              // APP4
              case 65509:
              // APP5
              case 65510:
              // APP6
              case 65511:
              // APP7
              case 65512:
              // APP8
              case 65513:
              // APP9
              case 65514:
              // APP10
              case 65515:
              // APP11
              case 65516:
              // APP12
              case 65517:
              // APP13
              case 65518:
              // APP14
              case 65519:
              // APP15
              case 65534:
                var appData = readDataBlock();
                if (fileMarker === 65534) {
                  var comment = String.fromCharCode.apply(null, appData);
                  this.comments.push(comment);
                }
                if (fileMarker === 65504) {
                  if (appData[0] === 74 && appData[1] === 70 && appData[2] === 73 && appData[3] === 70 && appData[4] === 0) {
                    jfif = {
                      version: { major: appData[5], minor: appData[6] },
                      densityUnits: appData[7],
                      xDensity: appData[8] << 8 | appData[9],
                      yDensity: appData[10] << 8 | appData[11],
                      thumbWidth: appData[12],
                      thumbHeight: appData[13],
                      thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                    };
                  }
                }
                if (fileMarker === 65505) {
                  if (appData[0] === 69 && appData[1] === 120 && appData[2] === 105 && appData[3] === 102 && appData[4] === 0) {
                    this.exifBuffer = appData.subarray(5, appData.length);
                  }
                }
                if (fileMarker === 65518) {
                  if (appData[0] === 65 && appData[1] === 100 && appData[2] === 111 && appData[3] === 98 && appData[4] === 101 && appData[5] === 0) {
                    adobe = {
                      version: appData[6],
                      flags0: appData[7] << 8 | appData[8],
                      flags1: appData[9] << 8 | appData[10],
                      transformCode: appData[11]
                    };
                  }
                }
                break;
              case 65499:
                var quantizationTablesLength = readUint16();
                var quantizationTablesEnd = quantizationTablesLength + offset - 2;
                while (offset < quantizationTablesEnd) {
                  var quantizationTableSpec = data[offset++];
                  requestMemoryAllocation(64 * 4);
                  var tableData = new Int32Array(64);
                  if (quantizationTableSpec >> 4 === 0) {
                    for (j2 = 0; j2 < 64; j2++) {
                      var z = dctZigZag[j2];
                      tableData[z] = data[offset++];
                    }
                  } else if (quantizationTableSpec >> 4 === 1) {
                    for (j2 = 0; j2 < 64; j2++) {
                      var z = dctZigZag[j2];
                      tableData[z] = readUint16();
                    }
                  } else
                    throw new Error("DQT: invalid table spec");
                  quantizationTables[quantizationTableSpec & 15] = tableData;
                }
                break;
              case 65472:
              // SOF0 (Start of Frame, Baseline DCT)
              case 65473:
              // SOF1 (Start of Frame, Extended DCT)
              case 65474:
                readUint16();
                frame = {};
                frame.extended = fileMarker === 65473;
                frame.progressive = fileMarker === 65474;
                frame.precision = data[offset++];
                frame.scanLines = readUint16();
                frame.samplesPerLine = readUint16();
                frame.components = {};
                frame.componentsOrder = [];
                var pixelsInFrame = frame.scanLines * frame.samplesPerLine;
                if (pixelsInFrame > maxResolutionInPixels) {
                  var exceededAmount = Math.ceil((pixelsInFrame - maxResolutionInPixels) / 1e6);
                  throw new Error(`maxResolutionInMP limit exceeded by ${exceededAmount}MP`);
                }
                var componentsCount = data[offset++], componentId;
                var maxH = 0, maxV = 0;
                for (i = 0; i < componentsCount; i++) {
                  componentId = data[offset];
                  var h = data[offset + 1] >> 4;
                  var v2 = data[offset + 1] & 15;
                  var qId = data[offset + 2];
                  if (h <= 0 || v2 <= 0) {
                    throw new Error("Invalid sampling factor, expected values above 0");
                  }
                  frame.componentsOrder.push(componentId);
                  frame.components[componentId] = {
                    h,
                    v: v2,
                    quantizationIdx: qId
                  };
                  offset += 3;
                }
                prepareComponents(frame);
                frames.push(frame);
                break;
              case 65476:
                var huffmanLength = readUint16();
                for (i = 2; i < huffmanLength; ) {
                  var huffmanTableSpec = data[offset++];
                  var codeLengths = new Uint8Array(16);
                  var codeLengthSum = 0;
                  for (j2 = 0; j2 < 16; j2++, offset++) {
                    codeLengthSum += codeLengths[j2] = data[offset];
                  }
                  requestMemoryAllocation(16 + codeLengthSum);
                  var huffmanValues = new Uint8Array(codeLengthSum);
                  for (j2 = 0; j2 < codeLengthSum; j2++, offset++)
                    huffmanValues[j2] = data[offset];
                  i += 17 + codeLengthSum;
                  (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] = buildHuffmanTable(codeLengths, huffmanValues);
                }
                break;
              case 65501:
                readUint16();
                resetInterval = readUint16();
                break;
              case 65500:
                readUint16();
                readUint16();
                break;
              case 65498:
                var scanLength = readUint16();
                var selectorsCount = data[offset++];
                var components = [], component;
                for (i = 0; i < selectorsCount; i++) {
                  component = frame.components[data[offset++]];
                  var tableSpec = data[offset++];
                  component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
                  component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
                  components.push(component);
                }
                var spectralStart = data[offset++];
                var spectralEnd = data[offset++];
                var successiveApproximation = data[offset++];
                var processed = decodeScan(
                  data,
                  offset,
                  frame,
                  components,
                  resetInterval,
                  spectralStart,
                  spectralEnd,
                  successiveApproximation >> 4,
                  successiveApproximation & 15,
                  this.opts
                );
                offset += processed;
                break;
              case 65535:
                if (data[offset] !== 255) {
                  offset--;
                }
                break;
              default:
                if (data[offset - 3] == 255 && data[offset - 2] >= 192 && data[offset - 2] <= 254) {
                  offset -= 3;
                  break;
                } else if (fileMarker === 224 || fileMarker == 225) {
                  if (malformedDataOffset !== -1) {
                    throw new Error(`first unknown JPEG marker at offset ${malformedDataOffset.toString(16)}, second unknown JPEG marker ${fileMarker.toString(16)} at offset ${(offset - 1).toString(16)}`);
                  }
                  malformedDataOffset = offset - 1;
                  const nextOffset = readUint16();
                  if (data[offset + nextOffset - 2] === 255) {
                    offset += nextOffset - 2;
                    break;
                  }
                }
                throw new Error("unknown JPEG marker " + fileMarker.toString(16));
            }
            fileMarker = readUint16();
          }
          if (frames.length != 1)
            throw new Error("only single frame JPEGs supported");
          for (var i = 0; i < frames.length; i++) {
            var cp = frames[i].components;
            for (var j2 in cp) {
              cp[j2].quantizationTable = quantizationTables[cp[j2].quantizationIdx];
              delete cp[j2].quantizationIdx;
            }
          }
          this.width = frame.samplesPerLine;
          this.height = frame.scanLines;
          this.jfif = jfif;
          this.adobe = adobe;
          this.components = [];
          for (var i = 0; i < frame.componentsOrder.length; i++) {
            var component = frame.components[frame.componentsOrder[i]];
            this.components.push({
              lines: buildComponentData(frame, component),
              scaleX: component.h / frame.maxH,
              scaleY: component.v / frame.maxV
            });
          }
        },
        getData: function getData(width, height) {
          var scaleX = this.width / width, scaleY = this.height / height;
          var component1, component2, component3, component4;
          var component1Line, component2Line, component3Line, component4Line;
          var x, y2;
          var offset = 0;
          var Y, Cb, Cr, K, C2, M2, Ye, R, G2, B2;
          var colorTransform;
          var dataLength = width * height * this.components.length;
          requestMemoryAllocation(dataLength);
          var data = new Uint8Array(dataLength);
          switch (this.components.length) {
            case 1:
              component1 = this.components[0];
              for (y2 = 0; y2 < height; y2++) {
                component1Line = component1.lines[0 | y2 * component1.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  Y = component1Line[0 | x * component1.scaleX * scaleX];
                  data[offset++] = Y;
                }
              }
              break;
            case 2:
              component1 = this.components[0];
              component2 = this.components[1];
              for (y2 = 0; y2 < height; y2++) {
                component1Line = component1.lines[0 | y2 * component1.scaleY * scaleY];
                component2Line = component2.lines[0 | y2 * component2.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  Y = component1Line[0 | x * component1.scaleX * scaleX];
                  data[offset++] = Y;
                  Y = component2Line[0 | x * component2.scaleX * scaleX];
                  data[offset++] = Y;
                }
              }
              break;
            case 3:
              colorTransform = true;
              if (this.adobe && this.adobe.transformCode)
                colorTransform = true;
              else if (typeof this.opts.colorTransform !== "undefined")
                colorTransform = !!this.opts.colorTransform;
              component1 = this.components[0];
              component2 = this.components[1];
              component3 = this.components[2];
              for (y2 = 0; y2 < height; y2++) {
                component1Line = component1.lines[0 | y2 * component1.scaleY * scaleY];
                component2Line = component2.lines[0 | y2 * component2.scaleY * scaleY];
                component3Line = component3.lines[0 | y2 * component3.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  if (!colorTransform) {
                    R = component1Line[0 | x * component1.scaleX * scaleX];
                    G2 = component2Line[0 | x * component2.scaleX * scaleX];
                    B2 = component3Line[0 | x * component3.scaleX * scaleX];
                  } else {
                    Y = component1Line[0 | x * component1.scaleX * scaleX];
                    Cb = component2Line[0 | x * component2.scaleX * scaleX];
                    Cr = component3Line[0 | x * component3.scaleX * scaleX];
                    R = clampTo8bit(Y + 1.402 * (Cr - 128));
                    G2 = clampTo8bit(Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
                    B2 = clampTo8bit(Y + 1.772 * (Cb - 128));
                  }
                  data[offset++] = R;
                  data[offset++] = G2;
                  data[offset++] = B2;
                }
              }
              break;
            case 4:
              if (!this.adobe)
                throw new Error("Unsupported color mode (4 components)");
              colorTransform = false;
              if (this.adobe && this.adobe.transformCode)
                colorTransform = true;
              else if (typeof this.opts.colorTransform !== "undefined")
                colorTransform = !!this.opts.colorTransform;
              component1 = this.components[0];
              component2 = this.components[1];
              component3 = this.components[2];
              component4 = this.components[3];
              for (y2 = 0; y2 < height; y2++) {
                component1Line = component1.lines[0 | y2 * component1.scaleY * scaleY];
                component2Line = component2.lines[0 | y2 * component2.scaleY * scaleY];
                component3Line = component3.lines[0 | y2 * component3.scaleY * scaleY];
                component4Line = component4.lines[0 | y2 * component4.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  if (!colorTransform) {
                    C2 = component1Line[0 | x * component1.scaleX * scaleX];
                    M2 = component2Line[0 | x * component2.scaleX * scaleX];
                    Ye = component3Line[0 | x * component3.scaleX * scaleX];
                    K = component4Line[0 | x * component4.scaleX * scaleX];
                  } else {
                    Y = component1Line[0 | x * component1.scaleX * scaleX];
                    Cb = component2Line[0 | x * component2.scaleX * scaleX];
                    Cr = component3Line[0 | x * component3.scaleX * scaleX];
                    K = component4Line[0 | x * component4.scaleX * scaleX];
                    C2 = 255 - clampTo8bit(Y + 1.402 * (Cr - 128));
                    M2 = 255 - clampTo8bit(Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
                    Ye = 255 - clampTo8bit(Y + 1.772 * (Cb - 128));
                  }
                  data[offset++] = 255 - C2;
                  data[offset++] = 255 - M2;
                  data[offset++] = 255 - Ye;
                  data[offset++] = 255 - K;
                }
              }
              break;
            default:
              throw new Error("Unsupported color mode");
          }
          return data;
        },
        copyToImageData: function copyToImageData(imageData, formatAsRGBA) {
          var width = imageData.width, height = imageData.height;
          var imageDataArray = imageData.data;
          var data = this.getData(width, height);
          var i = 0, j2 = 0, x, y2;
          var Y, K, C2, M2, R, G2, B2;
          switch (this.components.length) {
            case 1:
              for (y2 = 0; y2 < height; y2++) {
                for (x = 0; x < width; x++) {
                  Y = data[i++];
                  imageDataArray[j2++] = Y;
                  imageDataArray[j2++] = Y;
                  imageDataArray[j2++] = Y;
                  if (formatAsRGBA) {
                    imageDataArray[j2++] = 255;
                  }
                }
              }
              break;
            case 3:
              for (y2 = 0; y2 < height; y2++) {
                for (x = 0; x < width; x++) {
                  R = data[i++];
                  G2 = data[i++];
                  B2 = data[i++];
                  imageDataArray[j2++] = R;
                  imageDataArray[j2++] = G2;
                  imageDataArray[j2++] = B2;
                  if (formatAsRGBA) {
                    imageDataArray[j2++] = 255;
                  }
                }
              }
              break;
            case 4:
              for (y2 = 0; y2 < height; y2++) {
                for (x = 0; x < width; x++) {
                  C2 = data[i++];
                  M2 = data[i++];
                  Y = data[i++];
                  K = data[i++];
                  R = 255 - clampTo8bit(C2 * (1 - K / 255) + K);
                  G2 = 255 - clampTo8bit(M2 * (1 - K / 255) + K);
                  B2 = 255 - clampTo8bit(Y * (1 - K / 255) + K);
                  imageDataArray[j2++] = R;
                  imageDataArray[j2++] = G2;
                  imageDataArray[j2++] = B2;
                  if (formatAsRGBA) {
                    imageDataArray[j2++] = 255;
                  }
                }
              }
              break;
            default:
              throw new Error("Unsupported color mode");
          }
        }
      };
      var totalBytesAllocated = 0;
      var maxMemoryUsageBytes = 0;
      function requestMemoryAllocation(increaseAmount = 0) {
        var totalMemoryImpactBytes = totalBytesAllocated + increaseAmount;
        if (totalMemoryImpactBytes > maxMemoryUsageBytes) {
          var exceededAmount = Math.ceil((totalMemoryImpactBytes - maxMemoryUsageBytes) / 1024 / 1024);
          throw new Error(`maxMemoryUsageInMB limit exceeded by at least ${exceededAmount}MB`);
        }
        totalBytesAllocated = totalMemoryImpactBytes;
      }
      constructor.resetMaxMemoryUsage = function(maxMemoryUsageBytes_) {
        totalBytesAllocated = 0;
        maxMemoryUsageBytes = maxMemoryUsageBytes_;
      };
      constructor.getBytesAllocated = function() {
        return totalBytesAllocated;
      };
      constructor.requestMemoryAllocation = requestMemoryAllocation;
      return constructor;
    })();
    if (typeof module2 !== "undefined") {
      module2.exports = decode;
    } else if (typeof window !== "undefined") {
      window["jpeg-js"] = window["jpeg-js"] || {};
      window["jpeg-js"].decode = decode;
    }
    function decode(jpegData, userOpts = {}) {
      var defaultOpts = {
        // "undefined" means "Choose whether to transform colors based on the image’s color model."
        colorTransform: void 0,
        useTArray: false,
        formatAsRGBA: true,
        tolerantDecoding: true,
        maxResolutionInMP: 100,
        // Don't decode more than 100 megapixels
        maxMemoryUsageInMB: 512
        // Don't decode if memory footprint is more than 512MB
      };
      var opts = { ...defaultOpts, ...userOpts };
      var arr = new Uint8Array(jpegData);
      var decoder = new JpegImage();
      decoder.opts = opts;
      JpegImage.resetMaxMemoryUsage(opts.maxMemoryUsageInMB * 1024 * 1024);
      decoder.parse(arr);
      var channels = opts.formatAsRGBA ? 4 : 3;
      var bytesNeeded = decoder.width * decoder.height * channels;
      try {
        JpegImage.requestMemoryAllocation(bytesNeeded);
        var image = {
          width: decoder.width,
          height: decoder.height,
          exifBuffer: decoder.exifBuffer,
          data: opts.useTArray ? new Uint8Array(bytesNeeded) : Buffer.alloc(bytesNeeded)
        };
        if (decoder.comments.length > 0) {
          image["comments"] = decoder.comments;
        }
      } catch (err) {
        if (err instanceof RangeError) {
          throw new Error("Could not allocate enough memory for the image. Required: " + bytesNeeded);
        }
        if (err instanceof ReferenceError) {
          if (err.message === "Buffer is not defined") {
            throw new Error("Buffer is not globally defined in this environment. Consider setting useTArray to true");
          }
        }
        throw err;
      }
      decoder.copyToImageData(image, opts.formatAsRGBA);
      return image;
    }
  }
});

// node_modules/jpeg-js/index.js
var require_jpeg_js = __commonJS({
  "node_modules/jpeg-js/index.js"(exports2, module2) {
    var decode = require_decoder();
    module2.exports = { decode };
  }
});

// build_0.5.3/upload-duplicate-guard.js
var require_upload_duplicate_guard = __commonJS({
  "build_0.5.3/upload-duplicate-guard.js"(exports2, module2) {
    "use strict";
    var jpeg = require_jpeg_js();
    function rightRotate(value, amount) {
      return value >>> amount | value << 32 - amount;
    }
    function sha256Bytes(input) {
      const source = input instanceof Uint8Array ? input : new Uint8Array(input), bitLength = source.length * 8, paddedLength = Math.ceil((source.length + 9) / 64) * 64, bytes = new Uint8Array(paddedLength);
      bytes.set(source), bytes[source.length] = 128;
      const high = Math.floor(bitLength / 4294967296), low = bitLength >>> 0, end = paddedLength - 8;
      bytes[end] = high >>> 24, bytes[end + 1] = high >>> 16, bytes[end + 2] = high >>> 8, bytes[end + 3] = high, bytes[end + 4] = low >>> 24, bytes[end + 5] = low >>> 16, bytes[end + 6] = low >>> 8, bytes[end + 7] = low;
      const constants = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298], hash = [1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225], words = new Uint32Array(64);
      for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let i = 0; i < 16; i += 1) { const j2 = offset + i * 4; words[i] = (bytes[j2] << 24 | bytes[j2 + 1] << 16 | bytes[j2 + 2] << 8 | bytes[j2 + 3]) >>> 0; }
        for (let i = 16; i < 64; i += 1) { const s0 = rightRotate(words[i - 15], 7) ^ rightRotate(words[i - 15], 18) ^ words[i - 15] >>> 3, s1 = rightRotate(words[i - 2], 17) ^ rightRotate(words[i - 2], 19) ^ words[i - 2] >>> 10; words[i] = words[i - 16] + s0 + words[i - 7] + s1 >>> 0; }
        let [a,b,c,d,e,f,g,h] = hash;
        for (let i = 0; i < 64; i += 1) { const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25), choose = e & f ^ ~e & g, t1 = h + s1 + choose + constants[i] + words[i] >>> 0, s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22), majority = a & b ^ a & c ^ b & c, t2 = s0 + majority >>> 0; h = g; g = f; f = e; e = d + t1 >>> 0; d = c; c = b; b = a; a = t1 + t2 >>> 0; }
        hash[0] = hash[0] + a >>> 0, hash[1] = hash[1] + b >>> 0, hash[2] = hash[2] + c >>> 0, hash[3] = hash[3] + d >>> 0, hash[4] = hash[4] + e >>> 0, hash[5] = hash[5] + f >>> 0, hash[6] = hash[6] + g >>> 0, hash[7] = hash[7] + h >>> 0;
      }
      return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
    }
    function utf8Bytes(value) {
      const text = String(value == null ? "" : value), bytes = [];
      for (let i = 0; i < text.length; i += 1) {
        let code = text.charCodeAt(i);
        if (code >= 55296 && code <= 56319 && i + 1 < text.length) {
          const next = text.charCodeAt(i + 1);
          if (next >= 56320 && next <= 57343) {
            code = 65536 + ((code - 55296) << 10) + (next - 56320);
            i += 1;
          }
        }
        if (code < 128) bytes.push(code);
        else if (code < 2048) bytes.push(192 | code >> 6, 128 | code & 63);
        else if (code < 65536) bytes.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
        else bytes.push(240 | code >> 18, 128 | code >> 12 & 63, 128 | code >> 6 & 63, 128 | code & 63);
      }
      return new Uint8Array(bytes);
    }
    function hexBytes(value) {
      const hex = String(value || ""), bytes = new Uint8Array(Math.floor(hex.length / 2));
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return bytes;
    }
    function bytesHex(value) {
      return Array.from(value || []).map((byte) => Number(byte).toString(16).padStart(2, "0")).join("");
    }
    function concatBytes(...parts) {
      const arrays = parts.map((part) => part instanceof Uint8Array ? part : new Uint8Array(part || []));
      const output = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0));
      let offset = 0;
      for (const part of arrays) {
        output.set(part, offset);
        offset += part.length;
      }
      return output;
    }
    function hmacSha256(key, value) {
      let keyBytes = typeof key === "string" ? utf8Bytes(key) : key instanceof Uint8Array ? key : new Uint8Array(key || []);
      if (keyBytes.length > 64) keyBytes = hexBytes(sha256Bytes(keyBytes));
      const padded = new Uint8Array(64);
      padded.set(keyBytes.slice(0, 64));
      const innerPad = new Uint8Array(64), outerPad = new Uint8Array(64);
      for (let i = 0; i < 64; i += 1) {
        innerPad[i] = padded[i] ^ 54;
        outerPad[i] = padded[i] ^ 92;
      }
      const inner = hexBytes(sha256Bytes(concatBytes(innerPad, utf8Bytes(value))));
      return hexBytes(sha256Bytes(concatBytes(outerPad, inner)));
    }
    function awsEncode(value) {
      return encodeURIComponent(String(value == null ? "" : value)).replace(/[!'()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());
    }
    function archiveHost(bucket) {
      // Yandex recommends virtual-hosted URLs for ordinary object requests.
      // Keeping the bucket in the host also avoids the path-style request that
      // Object Storage was rejecting with a generic HTTP 400 response.
      return `${bucket}.storage.yandexcloud.net`;
    }
    function archiveUri(key) {
      return "/" + String(key || "").split("/").map(awsEncode).join("/");
    }
    function archiveDateParts(now = new Date()) {
      const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
      return { amzDate: iso, dateStamp: iso.slice(0, 8) };
    }
    function archiveSigningKey(secretKey, dateStamp) {
      const dateKey = hmacSha256("AWS4" + secretKey, dateStamp);
      const regionKey = hmacSha256(dateKey, "ru-central1");
      const serviceKey = hmacSha256(regionKey, "s3");
      return hmacSha256(serviceKey, "aws4_request");
    }
    function archiveConfigured(config) {
      return Boolean(config && config.archiveEnabled && config.archiveBucket && config.archiveAccessKey && config.archiveSecretKey);
    }
    function createArchiveSignedUrl(method, bucket, key, config, expiresSeconds = 900) {
      const host = archiveHost(bucket);
      const uri = archiveUri(key);
      const dateParts = archiveDateParts(new Date());
      const scope = `${dateParts.dateStamp}/ru-central1/s3/aws4_request`;
      const params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${config.archiveAccessKey}/${scope}`,
        "X-Amz-Date": dateParts.amzDate,
        "X-Amz-Expires": String(Math.max(60, Math.min(3600, Number(expiresSeconds) || 900))),
        "X-Amz-SignedHeaders": "host"
      };
      const canonicalQuery = Object.keys(params).sort().map((name) => `${awsEncode(name)}=${awsEncode(params[name])}`).join("&");
      const canonicalHeaders = `host:${host}\n`;
      const canonicalRequest = `${String(method || "GET").toUpperCase()}\n${uri}\n${canonicalQuery}\n${canonicalHeaders}\nhost\nUNSIGNED-PAYLOAD`;
      const stringToSign = `AWS4-HMAC-SHA256\n${dateParts.amzDate}\n${scope}\n${sha256Bytes(utf8Bytes(canonicalRequest))}`;
      const signature = bytesHex(hmacSha256(archiveSigningKey(config.archiveSecretKey, dateParts.dateStamp), stringToSign));
      return `https://${host}${uri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
    }
    function createArchiveSignedRequest(method, bucket, key, content, config) {
      const host = archiveHost(bucket);
      const uri = archiveUri(key);
      const dateParts = archiveDateParts(new Date());
      const scope = `${dateParts.dateStamp}/ru-central1/s3/aws4_request`;
      const payloadHash = sha256Bytes(utf8Bytes(content));
      const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${dateParts.amzDate}\n`;
      const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
      const canonicalRequest = `${String(method || "PUT").toUpperCase()}\n${uri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
      const stringToSign = `AWS4-HMAC-SHA256\n${dateParts.amzDate}\n${scope}\n${sha256Bytes(utf8Bytes(canonicalRequest))}`;
      const signature = bytesHex(hmacSha256(archiveSigningKey(config.archiveSecretKey, dateParts.dateStamp), stringToSign));
      return {
        url: `https://${host}${uri}`,
        headers: {
          "X-Amz-Content-Sha256": payloadHash,
          "X-Amz-Date": dateParts.amzDate,
          "Authorization": `AWS4-HMAC-SHA256 Credential=${config.archiveAccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        }
      };
    }
    function archiveDayAssociation(date) {
      return new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `receipt-archive-day:${date}`);
    }
    function postMessageFileIds(message) {
      const ids = [];
      const add = (file) => {
        const id = String(file && (file._id || file.id) || "");
        if (id && ids.indexOf(id) === -1) ids.push(id);
      };
      if (message && message.file) add(message.file);
      if (message && Array.isArray(message.files)) {
        for (const file of message.files) add(file);
      }
      return ids.sort();
    }
    function postMessageClaimKey(message) {
      const fileIds = postMessageFileIds(message);
      if (fileIds.length) return `upload:${fileIds.join(",")}`;
      const messageId = String(message && message.id || "");
      return messageId ? `message:${messageId}` : "";
    }
    function postMessageClaimAssociation(message) {
      const claimKey = postMessageClaimKey(message);
      return claimKey ? new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `tars-post-event:${claimKey}`) : void 0;
    }
    async function claimPostMessage(message, read, persistence, logger) {
      const claimKey = postMessageClaimKey(message);
      const association = postMessageClaimAssociation(message);
      if (!claimKey || !association) return "";
      const now = Date.now();
      const before = (await read.getPersistenceReader().readByAssociation(association) || []).filter((record) => record && record.claimKey === claimKey);
      const completed = before.find((record) => record.status === "completed");
      if (completed) {
        if (logger) logger.info(`CLAIM_PROBE key=${claimKey} result=skip-completed`);
        return "";
      }
      const token = `${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
      await persistence.createWithAssociation({
        claimKey,
        token,
        status: "claiming",
        claimedAt: now,
        expiresAt: now + 60 * 1e3
      }, association);
      // Preserve every contender instead of overwriting one shared record.
      // After a short collection window, every app worker sees the same oldest
      // token and only that worker is allowed to create the report message.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const records = (await read.getPersistenceReader().readByAssociation(association) || []).filter((record) => record && record.claimKey === claimKey);
      if (records.some((record) => record.status === "completed")) {
        if (logger) logger.info(`CLAIM_PROBE key=${claimKey} token=${token.slice(0, 12)} result=skip-completed-after-wait`);
        return "";
      }
      const contenders = records.filter((record) => record.status === "claiming" && Number(record.expiresAt || 0) > Date.now()).sort((left, right) => {
        const timeDifference = Number(left.claimedAt || 0) - Number(right.claimedAt || 0);
        return timeDifference || String(left.token || "").localeCompare(String(right.token || ""));
      });
      const winner = contenders[0];
      const won = Boolean(winner && String(winner.token || "") === token);
      if (logger) logger.info(`CLAIM_PROBE key=${claimKey} token=${token.slice(0, 12)} winner=${String(winner && winner.token || "").slice(0, 12)} result=${won ? "process" : "skip-lost"}`);
      return won ? token : "";
    }
    async function completePostMessageClaim(message, token, persistence, logger) {
      const claimKey = postMessageClaimKey(message);
      const association = postMessageClaimAssociation(message);
      if (!claimKey || !association || !token) return;
      await persistence.createWithAssociation({
        claimKey,
        token,
        status: "completed",
        completedAt: Date.now()
      }, association);
      if (logger) logger.info(`CLAIM_PROBE key=${claimKey} result=completed`);
    }
    function archiveObjectKey(file, receiptCheck, user, exact, now = Date.now()) {
      const date = String(receiptCheck && receiptCheck.receiptDate || "unknown"), parts = date.split("-"), username = String(user && user.username || user && user.id || "master").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "master", mime = String(file && file.type || "").toLowerCase(), extension = mime.indexOf("png") !== -1 ? "png" : "jpg";
      // The key is deterministic: if Rocket.Chat delivers the same event twice,
      // both PUT requests target one object instead of creating two archives.
      return `receipts/${parts[0] || "unknown"}/${parts[1] || "00"}/${parts[2] || "00"}/${username}/${String(exact || "unknown").slice(0, 32)}.${extension}.html`;
    }
    async function archiveReceiptYandex(file, content, receiptCheck, exact, read, persistence, http, config, logger) {
      if (!config || !config.archiveEnabled) return null;
      if (!archiveConfigured(config)) throw new Error("Yandex Object Storage archive is not configured");
      if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.archiveBucket)) throw new Error("Invalid Yandex Object Storage bucket name");
      const user = file && file.userId ? await read.getUserReader().getById(file.userId) : void 0;
      const now = Date.now(), objectKey = archiveObjectKey(file, receiptCheck, user, exact, now), mimeType = String(file && file.type || "image/jpeg").toLowerCase();
      const encodedImage = bytesToBase64(content);
      const archiveDocument = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GSNV Lab receipt</title><style>html,body{margin:0;background:#111;min-height:100%}body{display:flex;align-items:flex-start;justify-content:center}img{display:block;max-width:100%;height:auto}</style><img alt="Receipt" src="data:${mimeType};base64,${encodedImage}">`;
      const archiveByteLength = utf8Bytes(archiveDocument).length;
      // A pre-signed PUT URL is deliberately used here. Rocket.Chat may
      // normalize Authorization and x-amz-* headers; signing only the URL and
      // host keeps the request valid after it passes through IHttp.
      const uploadUrl = createArchiveSignedUrl("PUT", config.archiveBucket, objectKey, config, 900);
      const payloadHash = sha256Bytes(utf8Bytes(archiveDocument));
      if (logger) logger.info(`ARCHIVE_PROBE send mode=presigned bucket=${config.archiveBucket} key=${objectKey} bytes=${archiveByteLength} sha256=${String(payloadHash).slice(0, 16)}`);
      const response = await http.put(uploadUrl, {
        headers: {
          // Rocket.Chat owns framing for IHttp requests. Supplying a manual
          // Content-Length can coexist with its transfer encoding and Yandex
          // then rejects the request before S3 signature validation.
          "Content-Type": "text/html; charset=utf-8"
        },
        content: archiveDocument,
        timeout: 3e4
      });
      if (!response || response.statusCode < 200 || response.statusCode >= 300) {
        const responsePayload = response && (response.content || response.data);
        const responseText = (typeof responsePayload === "string" ? responsePayload : responsePayload ? JSON.stringify(responsePayload) : "").slice(0, 4000);
        const headers = response && response.headers;
        const headerValue = (name) => {
          if (!headers) return "";
          if (typeof headers.get === "function") return String(headers.get(name) || "");
          const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase() === String(name).toLowerCase());
          const value = key ? headers[key] : "";
          return Array.isArray(value) ? value.join(",") : String(value || "");
        };
        const requestId = headerValue("x-amz-request-id") || headerValue("x-request-id") || "none";
        throw new Error(`Object Storage HTTP ${response && response.statusCode || "unknown"}; requestId=${requestId}; sentBytes=${archiveByteLength}; response=${responseText || "empty"}`);
      }
      if (logger) logger.info(`ARCHIVE_PROBE stored bucket=${config.archiveBucket} key=${objectKey} bytes=${archiveByteLength}`);
      const archived = {
        archiveId: String(exact || "").slice(0, 16),
        archiveKey: objectKey,
        archiveBucket: config.archiveBucket,
        archiveStatus: "stored",
        archivedAt: now,
        receiptDate: receiptCheck && receiptCheck.receiptDate || "",
        receiptAmount: receiptCheck && receiptCheck.receiptAmount,
        exact,
        userId: user && user.id || file && file.userId || "",
        username: user && user.username || "",
        userName: user && user.name || "",
        originalName: String(file && file.name || "receipt.jpg").slice(0, 180),
        mimeType,
        size: content && content.length || 0,
        archiveEncoding: "data-url-html-v1",
        archiveSize: archiveDocument.length
      };
      await persistence.createWithAssociation(archived, archiveDayAssociation(archived.receiptDate));
      if (logger) logger.info(`Receipt ${archived.archiveId} stored in private object archive`);
      return archived;
    }
    const INTERNAL_ARCHIVE_ROOM = "cheki-arhiv";
    const RECEIPT_REVIEW_ROOM = "cheki-kontrol";
    const RECEIPT_CASH_RETENTION_MS = 24 * 60 * 60 * 1e3;
    const RECEIPT_ARCHIVE_RETENTION_MS = 90 * 24 * 60 * 60 * 1e3;
    const RECEIPT_ARCHIVE_DELAY_MS = RECEIPT_CASH_RETENTION_MS;
    function receiptArchiveDueAt(entry) {
      const explicit = Number(entry && entry.archiveDueAt || 0);
      if (explicit) return explicit;
      const uploadedAt = Number(entry && (entry.uploadedAt || entry.archivedAt) || 0);
      return uploadedAt ? uploadedAt + RECEIPT_ARCHIVE_DELAY_MS : 0;
    }
    function markReceiptArchivePending(entry, uploadedAt) {
      if (!entry || entry.archiveStatus === "stored" && entry.archiveKey) return entry;
      const base = Number(uploadedAt || entry.uploadedAt || Date.now());
      entry.archiveStatus = "pending";
      entry.archiveDueAt = base + RECEIPT_ARCHIVE_DELAY_MS;
      entry.archiveError = "";
      return entry;
    }
    function messageImageFiles(message) {
      const files = [];
      const seen = {};
      const addFile = (file) => {
        if (!file) return;
        const id = String(file._id || file.id || file.name || file.title || "");
        if (id && seen[id]) return;
        if (id) seen[id] = true;
        files.push(file);
      };
      if (message && message.file) addFile(message.file);
      if (message && Array.isArray(message.files)) {
        for (const file of message.files) addFile(file);
      }
      return files.filter((file) => file && /^image\//i.test(String(file.type || "")));
    }
    async function ensureInternalArchiveRoom(read, modify, config, logger) {
      let room;
      try {
        room = await read.getRoomReader().getByName(INTERNAL_ARCHIVE_ROOM);
      } catch (_2) {
        room = void 0;
      }
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!appUser) throw new Error("Tars app user was not found");
      const usernames = ["teimur", "shura", config && config.ownerUsername, config && config.adminUsername].map((value) => String(value || "").replace(/^@/, "").trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
      if (!room) {
        const existingUsers = [];
        for (const username of usernames) {
          try {
            const user = await read.getUserReader().getByUsername(username);
            if (user && user.username) existingUsers.push(user.username);
          } catch (_3) {
          }
        }
        const builder = modify.getCreator().startRoom().setCreator(appUser).setType(RoomType.PRIVATE_GROUP).setSlugifiedName(INTERNAL_ARCHIVE_ROOM).setDisplayName("Архив чеков").setReadOnly(true).setDisplayingOfSystemMessages(false).setMembersToBeAddedByUsernames(existingUsers);
        const roomId = await modify.getCreator().finish(builder);
        room = await read.getRoomReader().getById(roomId);
        if (!room) throw new Error("Private receipt archive room was not created");
        if (logger) logger.info(`Internal receipt archive room created: ${room.id}`);
      }
      try {
        const members = await read.getRoomReader().getMembers(room.id);
        const memberIds = new Set((members || []).map((member) => String(member && member.id || "")));
        const extender = await modify.getExtender().extendRoom(room.id, appUser);
        let changed = false;
        if (!memberIds.has(String(appUser.id || ""))) {
          extender.addMember(appUser);
          changed = true;
        }
        for (const username of usernames) {
          try {
            const user = await read.getUserReader().getByUsername(username);
            if (user && !memberIds.has(String(user.id || ""))) {
              extender.addMember(user);
              changed = true;
            }
          } catch (_4) {
          }
        }
        if (changed) await modify.getExtender().finish(extender);
      } catch (memberError) {
        if (logger) logger.warn(`Could not refresh internal archive members: ${memberError && memberError.message || memberError}`);
      }
      return { room, appUser };
    }
    async function ensureReceiptReviewRoom(read, modify, config, logger) {
      let room;
      try {
        room = await read.getRoomReader().getByName(RECEIPT_REVIEW_ROOM);
      } catch (_2) {
        room = void 0;
      }
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!appUser) throw new Error("Tars app user was not found");
      const usernames = ["teimur", "shura", config && config.ownerUsername, config && config.adminUsername].map((value) => String(value || "").replace(/^@/, "").trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
      if (!room) {
        const existingUsers = [];
        for (const username of usernames) {
          try {
            const user = await read.getUserReader().getByUsername(username);
            if (user && user.username) existingUsers.push(user.username);
          } catch (_3) {
          }
        }
        const builder = modify.getCreator().startRoom().setCreator(appUser).setType(RoomType.PRIVATE_GROUP).setSlugifiedName(RECEIPT_REVIEW_ROOM).setDisplayName("Контроль чеков").setReadOnly(false).setDisplayingOfSystemMessages(false).setMembersToBeAddedByUsernames(existingUsers);
        const roomId = await modify.getCreator().finish(builder);
        room = await read.getRoomReader().getById(roomId);
        if (!room) throw new Error("Receipt review room was not created");
        if (logger) logger.info(`Receipt review room created: ${room.id}`);
      }
      try {
        const members = await read.getRoomReader().getMembers(room.id);
        const memberIds = new Set((members || []).map((member) => String(member && member.id || "")));
        const extender = await modify.getExtender().extendRoom(room.id, appUser);
        let changed = false;
        if (!memberIds.has(String(appUser.id || ""))) {
          extender.addMember(appUser);
          changed = true;
        }
        for (const username of usernames) {
          try {
            const user = await read.getUserReader().getByUsername(username);
            if (user && !memberIds.has(String(user.id || ""))) {
              extender.addMember(user);
              changed = true;
            }
          } catch (_4) {
          }
        }
        if (changed) await modify.getExtender().finish(extender);
      } catch (memberError) {
        if (logger) logger.warn(`Could not refresh receipt review members: ${memberError && memberError.message || memberError}`);
      }
      return { room, appUser };
    }
    function internalArchiveFilename(file, receiptCheck, user, exact) {
      const date = String(receiptCheck && receiptCheck.receiptDate || "unknown"), username = String(user && user.username || user && user.id || "master").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "master", mime = String(file && file.type || "").toLowerCase(), extension = mime.indexOf("png") !== -1 ? "png" : mime.indexOf("webp") !== -1 ? "webp" : "jpg";
      return `receipt-${date}-${username}-${String(exact || "unknown").slice(0, 16)}.${extension}`;
    }
    function archiveMessageUploadIds(message) {
      const files = [];
      if (message && message.file) files.push(message.file);
      if (message && Array.isArray(message.files)) files.push(...message.files);
      const ids = [];
      for (const file of files) {
        const id = String(file && (file._id || file.id) || "");
        if (id && ids.indexOf(id) === -1) ids.push(id);
      }
      return ids;
    }
    function reportForwardAttachmentUrls(message) {
      const urls = [];
      for (const attachment of message && Array.isArray(message.attachments) ? message.attachments : []) {
        const candidates = [
          attachment && attachment.imageUrl,
          attachment && attachment.audioUrl,
          attachment && attachment.videoUrl,
          attachment && attachment.title && attachment.title.link
        ];
        for (const candidate of candidates) {
          const url = String(candidate || "");
          if (url && urls.indexOf(url) === -1) urls.push(url);
        }
      }
      return urls;
    }
    function reportForwardIdentity(message) {
      const customFields = message && message.customFields || {};
      const customUploadId = String(customFields.tarsReportUploadId || "");
      if (customUploadId) return `upload:${customUploadId}`;
      const urls = reportForwardAttachmentUrls(message);
      if (urls.length) return `url:${urls[0]}`;
      const uploadIds = archiveMessageUploadIds(message);
      return uploadIds.length ? `upload:${uploadIds[0]}` : "";
    }
    function reportForwardMatchesUpload(message, uploadId) {
      if (!message || !uploadId) return false;
      const customFields = message.customFields || {};
      if (String(customFields.tarsReportUploadId || "") === String(uploadId)) return true;
      if (archiveMessageUploadIds(message).indexOf(String(uploadId)) !== -1) return true;
      return reportForwardAttachmentUrls(message).some((url) => url.indexOf(String(uploadId)) !== -1);
    }
    function isTarsReportForwardMessage(message) {
      const customFields = message && message.customFields || {};
      if (customFields.tarsReportUploadId || customFields.tarsReportForward) return true;
      const text = String(message && message.text || "").trim();
      if (text.indexOf("ПЕРЕСЛАНО В ОТЧЁТ") !== -1) return true;
      const hasForwardMedia = archiveMessageUploadIds(message).length > 0 || reportForwardAttachmentUrls(message).length > 0;
      return hasForwardMedia && /^Мастер:\s*@?/i.test(text);
    }
    async function archiveMessageExists(roomId, uploadId, read) {
      if (!roomId || !uploadId || !read || !read.getRoomReader) return false;
      const roomReader = read.getRoomReader();
      if (!roomReader || typeof roomReader.getMessages !== "function") return false;
      // Newer Rocket.Chat versions expose an uploaded image in `files`, while
      // older versions use `file`. The room reader can also lag briefly behind
      // uploadBuffer(), so check both shapes and retry before declaring that
      // the archive copy is missing.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        for (let page = 0; page < 3; page += 1) {
          const messages = await roomReader.getMessages(roomId, {
            limit: 100,
            skip: page * 100,
            sort: { createdAt: "desc" }
          });
          if ((messages || []).some((message) => {
            const messageRoomId = String(message && (message.roomId || message.room && message.room.id) || "");
            return messageRoomId === String(roomId) && archiveMessageUploadIds(message).indexOf(String(uploadId)) !== -1;
          })) {
            return true;
          }
          if (!messages || messages.length < 100) break;
        }
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
      return false;
    }
    async function findArchiveMessageByUploadId(roomId, uploadId, read) {
      if (!roomId || !uploadId || !read || !read.getRoomReader) return void 0;
      const roomReader = read.getRoomReader();
      if (!roomReader || typeof roomReader.getMessages !== "function") return void 0;
      for (let page = 0; page < 10; page += 1) {
        const messages = await roomReader.getMessages(roomId, {
          limit: 100,
          skip: page * 100,
          sort: { createdAt: "desc" },
          showThreadMessages: true
        });
        const found = (messages || []).find((message) => {
          const messageRoomId = String(message && (message.roomId || message.room && message.room.id) || "");
          return messageRoomId === String(roomId) && reportForwardMatchesUpload(message, uploadId);
        });
        if (found) return found;
        if (!messages || messages.length < 100) break;
      }
      return void 0;
    }
    async function archiveTextMessage(oldMessage, room, read, modify, config, logger) {
      if (!oldMessage || !oldMessage.text || !String(oldMessage.text).trim()) return true;
      try {
        const { room: archiveRoom, appUser } = await ensureInternalArchiveRoom(read, modify, config, logger);
        const master = oldMessage.sender && (oldMessage.sender.username ? `@${oldMessage.sender.username}` : oldMessage.sender.name || oldMessage.sender.id) || "неизвестно";
        const roomLabel = room && (room.displayName || room.name || room.slugifiedName) || "личный чат";
        const whenText = oldMessage.createdAt ? displayDate(workdayForTimestamp(new Date(oldMessage.createdAt).getTime(), config)) : "—";
        const header = `🗄 АРХИВ СООБЩЕНИЯ\nЧат: ${roomLabel}\nАвтор: ${master}\nДата: ${whenText}\n---`;
        const builder = modify.getCreator().startMessage().setSender(appUser).setRoom(archiveRoom).setText(`${header}\n${oldMessage.text}`);
        await modify.getCreator().finish(builder);
        return true;
      } catch (error) {
        if (logger) logger.warn(`Could not archive text message ${oldMessage.id || "unknown"}: ${error && error.message || error}`);
        return false;
      }
    }
    async function createArchiveMessageForUpload(upload, filename, mimeType, room, appUser, modify, logger) {
      if (!upload || !upload.id || !room || !appUser || !modify || !modify.getCreator) return "";
      const uploadUrl = String(upload.url || "");
      const archiveFile = {
        _id: upload.id,
        name: filename || upload.name || "receipt.jpg",
        type: mimeType || upload.type || "image/jpeg"
      };
      const attachment = {
        type: "file",
        title: {
          value: archiveFile.name,
          link: uploadUrl || void 0,
          displayDownloadLink: true
        },
        imageUrl: /^image\//i.test(String(archiveFile.type || "")) ? uploadUrl || void 0 : void 0,
        description: "Архивный чек"
      };
      const builder = modify.getCreator().startMessage({
        room,
        sender: appUser,
        text: `Архив чека: ${archiveFile.name}`,
        file: archiveFile,
        attachments: [attachment],
        parseUrls: false
      });
      const messageId = await modify.getCreator().finish(builder);
      if (logger) logger.info(`Receipt archive message created in ${INTERNAL_ARCHIVE_ROOM}: message=${messageId || "unknown"} upload=${upload.id}`);
      return String(messageId || "");
    }
    function reviewReceiptFilename(file, user, exact) {
      const username = String(user && user.username || user && user.name || user && user.id || "master").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "master", mime = String(file && file.type || "").toLowerCase(), extension = mime.indexOf("png") !== -1 ? "png" : mime.indexOf("webp") !== -1 ? "webp" : "jpg";
      return `rejected-receipt-${username}-${String(exact || Date.now()).slice(0, 16)}.${extension}`;
    }
    async function createReviewMessageForUpload(upload, filename, mimeType, room, appUser, modify, logger, details) {
      if (!upload || !upload.id || !room || !appUser || !modify || !modify.getCreator) return "";
      const uploadUrl = String(upload.url || ""), reason = String(details && details.reason || "чек не прошёл проверку"), master = details && details.user ? `@${details.user.username || details.user.name || details.user.id}` : "мастер", sourceRoom = details && details.sourceRoom ? details.sourceRoom.displayName || details.sourceRoom.name || details.sourceRoom.slugifiedName || "" : "", amount = details && Number.isFinite(Number(details.receiptAmount)) ? `\nСумма: ${Number(details.receiptAmount)} ₽` : "", date = details && details.receiptDate ? `\nДата: ${details.receiptDate}` : "";
      const reviewFile = {
        _id: upload.id,
        name: filename || upload.name || "rejected-receipt.jpg",
        type: mimeType || upload.type || "image/jpeg"
      };
      const attachment = {
        type: "file",
        title: {
          value: reviewFile.name,
          link: uploadUrl || void 0,
          displayDownloadLink: true
        },
        imageUrl: /^image\//i.test(String(reviewFile.type || "")) ? uploadUrl || void 0 : void 0,
        description: reason
      };
      const text = `👁️ ЧЕК НА КОНТРОЛЬ\nМастер: ${master}${sourceRoom ? `\nОткуда: ${sourceRoom}` : ""}\nПричина: ${reason}${date}${amount}`;
      const builder = modify.getCreator().startMessage({
        room,
        sender: appUser,
        text,
        file: reviewFile,
        attachments: [attachment],
        parseUrls: false
      });
      const messageId = await modify.getCreator().finish(builder);
      if (logger) logger.info(`Receipt review message created in ${RECEIPT_REVIEW_ROOM}: message=${messageId || "unknown"} upload=${upload.id}`);
      return String(messageId || "");
    }
    async function findOtchetRoom(read) {
      const names = ["Otchet", "otchet", "Отчет", "отчет", "Отчёт", "отчёт", "Отчеты", "отчеты", "Отчёты", "отчёты"];
      for (const name of names) {
        try {
          const room = await read.getRoomReader().getByName(name);
          if (room) return room;
        } catch (_5) {
        }
      }
      return void 0;
    }
    function reportPhotoSourceUrl(message, uploadId, sourceFile, sourceUpload) {
      const attachments = message && Array.isArray(message.attachments) ? message.attachments : [];
      const filename = String(sourceFile && sourceFile.name || sourceUpload && sourceUpload.name || "");
      const matching = attachments.find((attachment) => {
        const title = String(attachment && attachment.title && attachment.title.value || "");
        const urls = [
          attachment && attachment.imageUrl,
          attachment && attachment.audioUrl,
          attachment && attachment.videoUrl,
          attachment && attachment.title && attachment.title.link
        ].map((value) => String(value || ""));
        return uploadId && urls.some((value) => value.indexOf(uploadId) !== -1) || filename && title === filename;
      }) || (attachments.length === 1 ? attachments[0] : void 0);
      return String(
        sourceUpload && (sourceUpload.url || sourceUpload.path) ||
        sourceFile && (sourceFile.url || sourceFile.path) ||
        matching && matching.title && matching.title.link ||
        matching && matching.imageUrl ||
        ""
      );
    }
    async function rocketChatSiteUrl(read, sourceFile, sourceUpload) {
      try {
        const serverSettings = read && read.getEnvironmentReader && read.getEnvironmentReader().getServerSettings();
        if (serverSettings && await serverSettings.isReadableById("Site_Url")) {
          const configured = String(await serverSettings.getValueById("Site_Url") || "").trim().replace(/\/+$/, "");
          if (configured) return configured;
        }
      } catch (_6) {
      }
      const sourceUrl = String(sourceUpload && sourceUpload.url || sourceFile && sourceFile.url || "");
      const absoluteOrigin = sourceUrl.match(/^(https?:\/\/[^/]+)/i);
      return absoluteOrigin ? absoluteOrigin[1].replace(/\/+$/, "") : "https://gsnvlabchat.ru";
    }
    async function rocketChatForwardPermalink(sourceMessage, sourceFile, sourceUpload, read) {
      if (!sourceMessage || !sourceMessage.id || !sourceMessage.room) return "";
      const baseUrl = await rocketChatSiteUrl(read, sourceFile, sourceUpload);
      if (!baseUrl) return "";
      const sourceRoom = sourceMessage.room;
      const roomType = String(sourceRoom.type || sourceRoom.t || "").toLowerCase();
      let route;
      if (roomType === "d" || roomType === "direct" || roomType.indexOf("direct") !== -1) {
        route = `/direct/${encodeURIComponent(String(sourceRoom.id || sourceRoom._id || ""))}`;
      } else {
        const roomName = String(sourceRoom.slugifiedName || sourceRoom.name || sourceRoom.displayName || sourceRoom.id || "");
        route = `${roomType === "c" || roomType === "channel" ? "/channel/" : "/group/"}${encodeURIComponent(roomName)}`;
      }
      return `${baseUrl}${route}?msg=${encodeURIComponent(String(sourceMessage.id))}`;
    }
    async function forwardReportPhotoMessage(sourceMessage, sourceFile, sourceUpload, room, appUser, modify, logger, details) {
      const uploadId = String(sourceFile && (sourceFile._id || sourceFile.id) || sourceUpload && (sourceUpload.id || sourceUpload._id) || "");
      if (!uploadId || !room || !appUser || !modify || !modify.getCreator) return "";
      const uploadUrl = reportPhotoSourceUrl(sourceMessage, uploadId, sourceFile, sourceUpload);
      const filename = String(sourceFile && sourceFile.name || sourceUpload && sourceUpload.name || "photo-report.jpg");
      const mimeType = String(sourceFile && sourceFile.type || sourceUpload && sourceUpload.type || "image/jpeg");
      const reportFile = {
        _id: uploadId,
        name: filename,
        type: mimeType
      };
      const attachment = {
        type: "file",
        title: {
          value: reportFile.name,
          link: uploadUrl || void 0,
          displayDownloadLink: true
        },
        imageUrl: /^image\//i.test(String(reportFile.type || "")) ? uploadUrl || void 0 : void 0
      };
      const master = details && details.user ? `@${details.user.username || details.user.name || details.user.id}` : "мастер";
      const text = `Мастер: ${master}`;
      const builder = modify.getCreator().startMessage({
        room,
        sender: appUser,
        text,
        file: reportFile,
        attachments: [attachment],
        parseUrls: false
      });
      const messageId = await modify.getCreator().finish(builder);
      if (logger) logger.info(`Report photo forwarded by reusing the original Rocket.Chat upload: message=${messageId || "unknown"} sourceUpload=${uploadId}`);
      return String(messageId || "");
    }
    async function cleanupDuplicateReportForwards(roomId, uploadId, read, modify, appUser, logger) {
      if (!roomId || !uploadId || !read || !read.getRoomReader || !modify || !modify.getDeleter || !appUser) return;
      const roomReader = read.getRoomReader();
      if (!roomReader || typeof roomReader.getMessages !== "function") return;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
        const matches = [];
        for (let page = 0; page < 3; page += 1) {
          const messages = await roomReader.getMessages(roomId, {
            limit: 100,
            skip: page * 100,
            sort: { createdAt: "desc" }
          });
          for (const candidate of messages || []) {
            const candidateSenderId = String(candidate && candidate.sender && candidate.sender.id || "");
            const candidateSenderName = String(candidate && candidate.sender && candidate.sender.username || "").toLowerCase();
            const appSenderId = String(appUser.id || "");
            const appSenderName = String(appUser.username || "").toLowerCase();
            const sameSender = appSenderId && candidateSenderId === appSenderId || appSenderName && candidateSenderName === appSenderName;
            const isReportForward = isTarsReportForwardMessage(candidate);
            if (!sameSender || !isReportForward) continue;
            if (reportForwardMatchesUpload(candidate, uploadId)) matches.push(candidate);
          }
          if (!messages || messages.length < 100) break;
        }
        if (matches.length < 2) continue;
        matches.sort((left, right) => {
          const leftTime = left && left.createdAt ? new Date(left.createdAt).getTime() : 0;
          const rightTime = right && right.createdAt ? new Date(right.createdAt).getTime() : 0;
          if (leftTime !== rightTime) return leftTime - rightTime;
          return String(left && left.id || "").localeCompare(String(right && right.id || ""));
        });
        // Every concurrent handler chooses the same oldest message. Never use
        // the locally-created id as the winner, otherwise two handlers could
        // each delete the other's message and leave no forwarded photo.
        const keep = matches[0];
        for (const duplicate of matches) {
          if (!duplicate || duplicate === keep || String(duplicate.id || "") === String(keep && keep.id || "")) continue;
          try {
            await modify.getDeleter().deleteMessage(duplicate, duplicate.sender || appUser);
            if (logger) logger.info(`Removed duplicate report forward: message=${duplicate.id || "unknown"} sourceUpload=${uploadId}`);
          } catch (error) {
            if (logger) logger.warn(`Could not remove duplicate report forward ${duplicate.id || "unknown"}: ${error && error.message || error}`);
          }
        }
      }
    }
    async function cleanupDuplicateReportForwardsInOtchet(read, modify, logger) {
      if (!read || !modify || !read.getRoomReader || !modify.getDeleter) return 0;
      const room = await findOtchetRoom(read);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) return 0;
      const groups = /* @__PURE__ */ new Map();
      const roomReader = read.getRoomReader();
      for (let page = 0; page < 10; page += 1) {
        const messages = await roomReader.getMessages(room.id, {
          limit: 100,
          skip: page * 100,
          sort: { createdAt: "desc" },
          showThreadMessages: true
        });
        for (const candidate of messages || []) {
          const candidateSenderId = String(candidate && candidate.sender && candidate.sender.id || "");
          const candidateSenderName = String(candidate && candidate.sender && candidate.sender.username || "").toLowerCase();
          const sameSender = String(appUser.id || "") && candidateSenderId === String(appUser.id || "") || String(appUser.username || "").toLowerCase() && candidateSenderName === String(appUser.username || "").toLowerCase();
          if (!sameSender || !isTarsReportForwardMessage(candidate)) continue;
          const identity = reportForwardIdentity(candidate);
          if (!identity) continue;
          if (!groups.has(identity)) groups.set(identity, []);
          groups.get(identity).push(candidate);
        }
        if (!messages || messages.length < 100) break;
      }
      let removed = 0;
      for (const [identity, candidates] of groups.entries()) {
        if (!candidates || candidates.length < 2) continue;
        candidates.sort((left, right) => {
          const leftTime = left && left.createdAt ? new Date(left.createdAt).getTime() : 0;
          const rightTime = right && right.createdAt ? new Date(right.createdAt).getTime() : 0;
          if (leftTime !== rightTime) return leftTime - rightTime;
          return String(left && left.id || "").localeCompare(String(right && right.id || ""));
        });
        const keep = candidates[0];
        for (const duplicate of candidates.slice(1)) {
          if (!duplicate || String(duplicate.id || "") === String(keep && keep.id || "")) continue;
          try {
            await modify.getDeleter().deleteMessage(duplicate, duplicate.sender || appUser);
            removed += 1;
            if (logger) logger.info(`Removed existing duplicate report forward: message=${duplicate.id || "unknown"} identity=${identity.slice(0, 120)}`);
          } catch (error) {
            if (logger) logger.warn(`Could not remove existing duplicate report forward ${duplicate.id || "unknown"}: ${error && error.message || error}`);
          }
        }
      }
      return removed;
    }
    async function cleanupMailingProofForwardsInOtchet(read, modify, http, config, logger) {
      if (!read || !modify) return 0;
      const room = await findOtchetRoom(read);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) return 0;
      let removed = 0;
      for (let skip = 0; skip < 300; skip += 100) {
        const messages = await read.getRoomReader().getMessages(room.id, {
          limit: 100,
          skip,
          sort: { createdAt: "desc" },
          showThreadMessages: false
        });
        if (!messages || !messages.length) break;
        for (const message of messages) {
          if (!message || !isTarsAppMessage(message, appUser) || !messageImageFiles(message).length) continue;
          if (looksLikeMailingProofText(messageDescriptorText(message))) {
            try {
              await modify.getDeleter().deleteMessage(message, message.sender || appUser);
              removed += 1;
            } catch (error) {
              if (logger) logger.warn(`Could not delete mailing proof forward ${message.id || "unknown"}: ${error && error.message || error}`);
            }
            continue;
          }
          for (const file of messageImageFiles(message)) {
            const uploadId = String(file && (file._id || file.id) || "");
            if (!uploadId) continue;
            try {
              const content = await read.getUploadReader().getBufferById(uploadId);
              const kind = await personalImageKindForPreUpload(file, content, http, config, logger);
              if (kind !== "mailing") continue;
              await modify.getDeleter().deleteMessage(message, message.sender || appUser);
              removed += 1;
              break;
            } catch (error) {
              if (logger) logger.warn(`Could not inspect mailing proof forward ${message.id || "unknown"}: ${error && error.message || error}`);
            }
          }
        }
        if (messages.length < 100) break;
      }
      if (removed && logger) logger.info(`Removed ${removed} mailing proof forward(s) from Otchet`);
      return removed;
    }
    async function requestOpenAiWorkPhotoCheck(file, content, http, config, logger) {
      if (!config || !config.openaiApiKey || !content || !content.length || !http) return false;
      const model = String(config.openaiReceiptModel || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
      const imageUrl = `data:${receiptImageMimeType(file)};base64,${bytesToBase64(content)}`;
      try {
        const response = await http.post("https://api.openai.com/v1/responses", {
          headers: {
            Authorization: "Bearer " + config.openaiApiKey,
            "Content-Type": "application/json"
          },
          data: {
            model,
            input: [{
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: 'Определи только одно: является ли изображение фото выполненной работы салона. Фото работы = стрижка, укладка, окрашивание, волосы крупным планом, маникюр/ногетьи, педикюр/стопы, брови или ресницы. Банковские чеки, квитанции, экраны банков, QR/СБП, скриншоты переписки/рассылки, интерфейс Rocket.Chat, интерьер салона, товары и любые другие изображения не являются фото работы. Верни только JSON без Markdown: {"is_work_photo":true|false,"kind":"hair|nails|pedicure|brows_lashes|other"}.'
                },
                { type: "input_image", image_url: imageUrl }
              ]
            }],
            max_output_tokens: 120
          },
          timeout: 2e4
        });
        if (!response || response.statusCode < 200 || response.statusCode >= 300) return false;
        const payload = response.data || response.content || response;
        const text = openAiReceiptOutputText(payload);
        const match = String(text || "").match(/\{[\s\S]{0,10000}\}/);
        if (!match) return false;
        const parsed = JSON.parse(match[0]);
        return parsed && parsed.is_work_photo === true;
      } catch (error) {
        if (logger) logger.warn(`Dedicated work-photo Vision failed: ${error && error.message || error}`);
        return false;
      }
    }
    async function shouldForwardConfirmedWorkPhoto(file, content, http, config, logger) {
      const finalKind = await personalImageKindForPreUpload(file, content, http, config, logger);
      if (finalKind === "photo") return { forward: true, reason: "classifier" };
      if (finalKind === "receipt") return { forward: false, reason: "receipt" };
      if (finalKind === "mailing") return { forward: false, reason: "mailing" };
      if (finalKind === "unknown" || !finalKind) {
        // Stable 0.9.344 behavior: receipt and mailing are already blocked;
        // an otherwise unknown personal image continues to Reports.
        return { forward: true, reason: "stable-0944-unknown-photo-fallback" };
      }
      return { forward: false, reason: finalKind || "unknown" };
    }
    async function fastForwardPersonalReportPhotos(message, read, persistence, modify, logger, http, config) {
      if (!message || !isPersonalTarsRoom(message.room)) return false;
      const intent = directFileIntent(message);
      if (intent === "mailing" || intent === "receipt") return false;
      if (blocksPersonalPhotoForwardingText(normalizedMessageDescriptor(message))) return false;
      const imageFiles = messageImageFiles(message);
      if (!imageFiles.length) return false;
      const room = await findOtchetRoom(read);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) {
        if (logger) logger.warn("FAST_PHOTO_FORWARD_BLOCKED Otchet room or app user not found");
        return false;
      }
      const indexName = PROTECTED_ROOMS.otchet.index;
      const index = await readIndex(read, indexName);
      const sourceMessageId = String(message.id || "");
      if (sourceMessageId && Array.isArray(index.photos) && index.photos.some((entry) => {
        if (!entry || String(entry.messageId || "") !== sourceMessageId) return false;
        const reportMessageId = String(entry.reportMessageId || "");
        const staleStatus = reportMessageId === "duplicate" || reportMessageId === "blocked" || reportMessageId === "failed";
        return Boolean(entry.reportUploadId || reportMessageId && reportMessageId !== "publishing" && !staleStatus);
      })) {
        if (logger) logger.info(`FAST_PHOTO_FORWARD_SKIP_MESSAGE_ALREADY_PUBLISHED message=${sourceMessageId}`);
        return true;
      }
      let bestCandidate;
      for (let attempt = 0; attempt < 3 && !bestCandidate; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700));
        for (const sourceFile of imageFiles) {
          const candidateUploadId = String(sourceFile && (sourceFile._id || sourceFile.id) || "");
          if (!candidateUploadId) continue;
          try {
            const content = await read.getUploadReader().getBufferById(candidateUploadId);
            const size = content && content.length || Number(sourceFile && (sourceFile.size || sourceFile.fileSize) || 0);
            if (!bestCandidate || size > bestCandidate.size) bestCandidate = { sourceFile, uploadId: candidateUploadId, content, size };
          } catch (error) {
            if (logger) logger.warn(`FAST_PHOTO_FORWARD_CANDIDATE_FAILED attempt=${attempt + 1} upload=${candidateUploadId}: ${error && error.message || error}`);
          }
        }
      }
      if (!bestCandidate) return false;
      const sourceFile = bestCandidate.sourceFile;
      const uploadId = bestCandidate.uploadId;
      const receiptIndex = await readIndex(read, PROTECTED_ROOMS.kassa.index);
      const postedExact = exactHash(bestCandidate.content);
      const preclassifiedReceipt = Array.isArray(receiptIndex.photos) && receiptIndex.photos.find((entry) => preUploadEntryMatchesPostedContent(entry, postedExact, message));
      if (preclassifiedReceipt) {
        if (logger) logger.info(`FAST_PHOTO_FORWARD_BLOCKED_PRECLASSIFIED_RECEIPT upload=${uploadId}`);
        if (!preclassifiedReceipt.resultMessageId) {
          try {
            if (await publishAcceptedReceipt(preclassifiedReceipt, message, read, modify, config, logger)) {
              await writeIndex(persistence, PROTECTED_ROOMS.kassa.index, receiptIndex);
            }
          } catch (error) {
            if (logger) logger.warn(`Could not publish preclassified receipt result: ${error && error.message || error}`);
          }
        }
        try {
          await publishMasterTransferSummary(preclassifiedReceipt, message, read, persistence, modify, config, logger, true);
        } catch (error) {
          if (logger) logger.warn(`Could not publish immediate receipt total: ${error && error.message || error}`);
        }
        return false;
      }
      const workPhotoDecision = await shouldForwardConfirmedWorkPhoto(sourceFile, bestCandidate.content, http, config, logger);
      if (!workPhotoDecision.forward) {
        if (logger) logger.info(`FAST_PHOTO_FORWARD_BLOCKED upload=${uploadId} reason=${workPhotoDecision.reason || "unknown"}`);
        return false;
      }
      if (logger) logger.info(`FAST_PHOTO_FORWARD_CONFIRMED upload=${uploadId} source=${workPhotoDecision.reason || "unknown"}`);
      const alreadyPublished = Array.isArray(index.photos) && index.photos.some((entry) => {
        if (!entry) return false;
        const sameUpload = String(entry.uploadId || entry.reportUploadId || "") === uploadId;
        const reportMessageId = String(entry.reportMessageId || "");
        const staleStatus = reportMessageId === "duplicate" || reportMessageId === "blocked" || reportMessageId === "failed";
        const published = Boolean(entry.reportUploadId || reportMessageId && reportMessageId !== "publishing" && !staleStatus);
        return sameUpload && entry.reportMessageId !== "publishing" && published;
      });
      if (alreadyPublished) {
        if (logger) logger.info(`FAST_PHOTO_FORWARD_SKIP_ALREADY_PUBLISHED upload=${uploadId}`);
        return true;
      }
      try {
        const content = bestCandidate.content;
        const exact = exactHash(content);
        const visual = visualHash(sourceFile, content);
        const duplicate = findExactDuplicate(index, exact);
        const duplicateReportMessageId = String(duplicate && duplicate.reportMessageId || "");
        const duplicateStaleStatus = duplicateReportMessageId === "duplicate" || duplicateReportMessageId === "blocked" || duplicateReportMessageId === "failed";
        const duplicatePublished = Boolean(duplicate && (duplicate.reportUploadId || duplicateReportMessageId && duplicateReportMessageId !== "publishing" && !duplicateStaleStatus));
        const reusablePreUpload = Boolean(
          duplicate &&
          duplicate.source === "pre" &&
          (!duplicate.uploadId || String(duplicate.uploadId || "") === uploadId) &&
          (!duplicate.userId || String(duplicate.userId || "") === String(message.sender && message.sender.id || "")) &&
          (!duplicate.roomId || String(duplicate.roomId || "") === String(message.room && message.room.id || ""))
        );
        if (duplicate && duplicatePublished && !reusablePreUpload && String(duplicate.uploadId || "") !== uploadId) {
          if (logger) logger.info(`FAST_PHOTO_FORWARD_SKIP_DUPLICATE upload=${uploadId}`);
          return true;
        }
        if (reusablePreUpload && logger) logger.info(`FAST_PHOTO_FORWARD_REUSE_PRE upload=${uploadId}`);
        const now = Date.now();
        const entry = duplicate || {
          exact,
          visual,
          source: "fast-post",
          uploadedAt: now,
          userId: message.sender && message.sender.id || "",
          username: message.sender && message.sender.username || "",
          userName: message.sender && message.sender.name || "",
          roomId: message.room && message.room.id || "",
          sourceRoomIsDirect: true,
          expiresAt: now + 24 * 60 * 60 * 1e3,
          messageId: message.id || "",
          uploadId,
          postProcessedAt: now
        };
        if (!duplicate) index.photos.push(entry);
        entry.exact = entry.exact || exact;
        entry.visual = entry.visual || visual;
        entry.source = entry.source === "pre" ? "fast-post" : entry.source || "fast-post";
        entry.uploadedAt = Number(entry.uploadedAt || now);
        entry.userId = message.sender && message.sender.id || entry.userId || "";
        entry.username = message.sender && message.sender.username || entry.username || "";
        entry.userName = message.sender && message.sender.name || entry.userName || "";
        entry.roomId = message.room && message.room.id || entry.roomId || "";
        entry.sourceRoomIsDirect = true;
        entry.expiresAt = entry.expiresAt || now + 24 * 60 * 60 * 1e3;
        entry.messageId = message.id || entry.messageId || "";
        entry.uploadId = uploadId;
        entry.postProcessedAt = now;
        entry.reportRoomId = room.id;
        entry.reportMessageId = "publishing";
        entry.reportPublishedAt = now;
        await writeIndex(persistence, indexName, index);
        const sourceUpload = await read.getUploadReader().getById(uploadId);
        let reportMessageId = await forwardReportPhotoMessage(message, sourceFile, sourceUpload, room, appUser, modify, logger, {
          user: message.sender,
          sourceMessageId: message.id,
          read,
          content,
          http,
          config
        });
        if (!reportMessageId) {
          // Independent delivery fallback, but still inside the existing guarded
          // photo-forwarding path. Receipts/mailings never reach this point.
          const fallbackFile = {
            _id: uploadId,
            name: String(sourceFile && (sourceFile.name || sourceFile.title) || sourceUpload && sourceUpload.name || "photo-report.jpg"),
            type: String(sourceFile && (sourceFile.type || sourceFile.mimeType) || sourceUpload && sourceUpload.type || "image/jpeg")
          };
          const master = message.sender ? `@${message.sender.username || message.sender.name || message.sender.id}` : "мастер";
          const fallbackBuilder = modify.getCreator().startMessage({
            room,
            sender: appUser,
            text: `Мастер: ${master}`,
            file: fallbackFile,
            parseUrls: false
          });
          reportMessageId = await modify.getCreator().finish(fallbackBuilder);
          if (reportMessageId && logger) logger.info(`FAST_PHOTO_FORWARD_FALLBACK_OK upload=${uploadId} message=${reportMessageId}`);
        }
        if (!reportMessageId) throw new Error("Rocket.Chat did not create the fast forwarded report photo message");
        entry.reportRoomId = room.id;
        entry.reportUploadId = uploadId;
        entry.reportMessageId = reportMessageId;
        entry.reportPublishedAt = Date.now();
        delete entry.reportPublishLockUntil;
        await writeIndex(persistence, indexName, index);
        await cleanupDuplicateReportForwards(room.id, uploadId, read, modify, appUser, logger);
        if (logger) logger.info(`FAST_PHOTO_FORWARD_OK upload=${uploadId} size=${bestCandidate.size} message=${reportMessageId}`);
        return true;
      } catch (error) {
        const current = Array.isArray(index.photos) && index.photos.find((entry) => entry && String(entry.uploadId || "") === uploadId);
        if (current && current.reportMessageId === "publishing") {
          delete current.reportMessageId;
          delete current.reportPublishedAt;
          delete current.reportPublishLockUntil;
          await writeIndex(persistence, indexName, index);
        }
        if (logger) logger.warn(`FAST_PHOTO_FORWARD_FAILED upload=${uploadId}: ${error && error.message || error}`);
      }
      return false;
    }
    async function publishDirectReportPhotos(message, read, persistence, modify, logger, entries = [], index, indexName, http, config) {
      if (!message || !isPersonalTarsRoom(message.room) || !entries || !entries.length || !index || !indexName) return false;
      const room = await findOtchetRoom(read);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) {
        if (logger) logger.warn("Could not publish direct report photo: Otchet room or app user not found");
        return false;
      }
      let published = false;
      for (const entry of entries) {
        if (!entry) continue;
        const uploadId = String(entry.uploadId || "");
        if (!uploadId) continue;
        const now = Date.now();
        const lockUntil = Number(entry.reportPublishLockUntil || 0);
        const currentReportMessageId = String(entry.reportMessageId || "");
        const staleReportStatus = currentReportMessageId === "duplicate" || currentReportMessageId === "blocked" || currentReportMessageId === "failed";
        if (staleReportStatus) {
          delete entry.reportMessageId;
          delete entry.reportPublishedAt;
          delete entry.reportPublishLockUntil;
        }
        if (entry.reportMessageId && entry.reportMessageId !== "publishing") continue;
        if (entry.reportMessageId === "publishing" && lockUntil > now) continue;
        if (entry.reportMessageId === "publishing") {
          delete entry.reportMessageId;
          delete entry.reportPublishedAt;
          delete entry.reportPublishLockUntil;
        }
        const exact = String(entry.exact || "");
        const sourceMessageId = String(message.id || "");
        if (sourceMessageId && !entry.sourceMessageId) entry.sourceMessageId = sourceMessageId;
        const alreadyPublishingOrPublished = Array.isArray(index.photos) && index.photos.some((other) => {
          if (!other || other === entry) return false;
          const otherReportMessageId = String(other.reportMessageId || "");
          const otherStaleStatus = otherReportMessageId === "duplicate" || otherReportMessageId === "blocked" || otherReportMessageId === "failed";
          const otherPublished = Boolean(other.reportUploadId || otherReportMessageId && otherReportMessageId !== "publishing" && !otherStaleStatus);
          if (!otherPublished) return false;
          if (uploadId && String(other.uploadId || "") === uploadId) return true;
          if (exact && String(other.exact || "") === exact) return true;
          if (sourceMessageId && String(other.sourceMessageId || other.messageId || "") === sourceMessageId && String(other.uploadId || "") === uploadId) return true;
          return false;
        });
        if (alreadyPublishingOrPublished) {
          entry.reportRoomId = entry.reportRoomId || room.id;
          entry.reportMessageId = entry.reportMessageId || "duplicate";
          entry.reportPublishedAt = entry.reportPublishedAt || Date.now();
          published = true;
          continue;
        }
        entry.reportRoomId = room.id;
        entry.reportMessageId = "publishing";
        entry.reportPublishedAt = now;
        entry.reportPublishLockUntil = now + 5 * 60 * 1e3;
        await writeIndex(persistence, indexName, index);
        try {
          const sourceFile = messageFiles(message).find((file) => String(file && (file._id || file.id) || "") === uploadId);
          if (!sourceFile) {
            delete entry.reportMessageId;
            delete entry.reportPublishedAt;
            delete entry.reportPublishLockUntil;
            published = true;
            continue;
          }
          const content = await read.getUploadReader().getBufferById(uploadId);
          const confirmedKind = await personalImageKindForPreUpload(sourceFile, content, http, config, logger);
          if (confirmedKind !== "photo") {
            entry.reportMessageId = "blocked_not_work_photo";
            entry.reportPublishedAt = Date.now();
            delete entry.reportPublishLockUntil;
            published = true;
            if (logger) logger.info(`DIRECT_PHOTO_FORWARD_BLOCKED_NOT_WORK_PHOTO upload=${uploadId} kind=${confirmedKind || "unknown"}`);
            continue;
          }
          const existingForward = await findArchiveMessageByUploadId(room.id, uploadId, read);
          if (existingForward) {
            entry.reportRoomId = room.id;
            entry.reportUploadId = uploadId;
            entry.reportMessageId = String(existingForward.id || uploadId || "published");
            entry.reportPublishedAt = Date.now();
            delete entry.reportPublishLockUntil;
            published = true;
            continue;
          }
          const sourceUpload = await read.getUploadReader().getById(uploadId);
          const messageId = await forwardReportPhotoMessage(message, sourceFile, sourceUpload, room, appUser, modify, logger, {
            user: message.sender,
            sourceMessageId: message.id,
            read,
            content,
            http,
            config
          });
          if (!messageId) throw new Error("Rocket.Chat did not create the forwarded report photo message");
          entry.reportRoomId = room.id;
          entry.reportUploadId = uploadId;
          entry.reportMessageId = messageId;
          entry.reportPublishedAt = Date.now();
          delete entry.reportPublishLockUntil;
          published = true;
          await cleanupDuplicateReportForwards(room.id, uploadId, read, modify, appUser, logger);
        } catch (error) {
          delete entry.reportMessageId;
          delete entry.reportPublishedAt;
          delete entry.reportPublishLockUntil;
          published = true;
          if (logger) logger.warn(`Could not publish direct report photo ${uploadId || "unknown"}: ${error && error.message || error}`);
        }
      }
      if (published) await writeIndex(persistence, indexName, index);
      return published;
    }
    async function publishPendingReportPhotos(read, persistence, modify, logger, http, config) {
      if (!read || !persistence || !modify) return 0;
      const indexName = PROTECTED_ROOMS.otchet.index;
      const index = await readIndex(read, indexName);
      const recentCutoff = Date.now() - 24 * 60 * 60 * 1e3;
      const pending = (index.photos || []).filter((entry) => {
        if (!entry || !entry.sourceRoomIsDirect || !entry.uploadId || !entry.messageId) return false;
        if (!entry.reportQueuedAt && !(entry.postProcessedAt && Number(entry.uploadedAt || 0) >= recentCutoff)) return false;
        const reportMessageId = String(entry.reportMessageId || "");
        const staleStatus = reportMessageId === "duplicate" || reportMessageId === "blocked" || reportMessageId === "failed";
        if (entry.reportMessageId && entry.reportMessageId !== "publishing" && !staleStatus) return false;
        return !(entry.reportMessageId === "publishing" && Number(entry.reportPublishLockUntil || 0) > Date.now());
      }).slice(0, 50);
      if (!pending.length) return 0;
      let handled = 0;
      const grouped = /* @__PURE__ */ new Map();
      for (const entry of pending) {
        const messageId = String(entry.messageId || "");
        if (!grouped.has(messageId)) grouped.set(messageId, []);
        grouped.get(messageId).push(entry);
      }
      for (const [messageId, entries] of grouped.entries()) {
        try {
          const message = await read.getMessageReader().getById(messageId);
          if (!message) {
            for (const entry of entries) {
              entry.reportQueueAttempts = Number(entry.reportQueueAttempts || 0) + 1;
              entry.reportQueueLastAttemptAt = Date.now();
            }
            continue;
          }
          if (await publishDirectReportPhotos(message, read, persistence, modify, logger, entries, index, indexName, http, config)) {
            handled += entries.length;
          }
        } catch (error) {
          for (const entry of entries) {
            entry.reportQueueAttempts = Number(entry.reportQueueAttempts || 0) + 1;
            entry.reportQueueLastAttemptAt = Date.now();
          }
          if (logger) logger.warn(`Could not process queued report photo ${messageId || "unknown"}: ${error && error.message || error}`);
        }
      }
      await writeIndex(persistence, indexName, index);
      try {
        await cleanupDuplicateReportForwardsInOtchet(read, modify, logger);
      } catch (error) {
        if (logger) logger.warn(`Could not clean report forwards after queue processing: ${error && error.message || error}`);
      }
      return handled;
    }
    async function resetInvisiblePermalinkForwards(read, persistence, modify, logger) {
      if (!read || !persistence || !modify) return 0;
      const indexName = PROTECTED_ROOMS.otchet.index;
      const index = await readIndex(read, indexName);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      let reset = 0;
      for (const entry of index.photos || []) {
        const reportMessageId = String(entry && entry.reportMessageId || "");
        if (!entry || !entry.sourceRoomIsDirect || !entry.uploadId || !entry.messageId || !reportMessageId || reportMessageId === "publishing" || reportMessageId === "duplicate") continue;
        try {
          const reportMessage = await read.getMessageReader().getById(reportMessageId);
          if (!reportMessage || !/^\[ \]\(https?:\/\//.test(String(reportMessage.text || "").trim())) continue;
          if (appUser && modify.getDeleter) {
            try {
              await modify.getDeleter().deleteMessage(reportMessage, reportMessage.sender || appUser);
            } catch (_6) {
            }
          }
          delete entry.reportMessageId;
          delete entry.reportUploadId;
          delete entry.reportPublishedAt;
          delete entry.reportPublishLockUntil;
          entry.reportQueuedAt = Date.now();
          reset += 1;
        } catch (_7) {
        }
      }
      if (reset) {
        await writeIndex(persistence, indexName, index);
        if (logger) logger.info(`Reset ${reset} invisible permalink report forward(s)`);
      }
      return reset;
    }
    async function resetStaleReportPhotoForwards(read, persistence, logger) {
      if (!read || !persistence) return 0;
      const indexName = PROTECTED_ROOMS.otchet.index;
      const index = await readIndex(read, indexName);
      const now = Date.now();
      const recentCutoff = now - 48 * 60 * 60 * 1e3;
      let reset = 0;
      for (const entry of index.photos || []) {
        if (!entry || !entry.sourceRoomIsDirect || !entry.uploadId || !entry.messageId) continue;
        if (Number(entry.uploadedAt || entry.postProcessedAt || 0) < recentCutoff) continue;
        const reportMessageId = String(entry.reportMessageId || "");
        const staleStatus = reportMessageId === "duplicate" || reportMessageId === "blocked" || reportMessageId === "failed";
        let staleMissingMessage = false;
        if (reportMessageId && reportMessageId !== "publishing" && !staleStatus) {
          try {
            staleMissingMessage = !await read.getMessageReader().getById(reportMessageId);
          } catch (_7) {
            staleMissingMessage = true;
          }
        }
        if (!staleStatus && !staleMissingMessage && !(entry.reportMessageId === "publishing" && Number(entry.reportPublishLockUntil || 0) <= now)) continue;
        delete entry.reportMessageId;
        delete entry.reportUploadId;
        delete entry.reportPublishedAt;
        delete entry.reportPublishLockUntil;
        delete entry.reportBlockedReason;
        delete entry.reportBlockedAt;
        entry.reportQueuedAt = now;
        reset += 1;
      }
      if (reset) {
        await writeIndex(persistence, indexName, index);
        if (logger) logger.info(`Reset ${reset} stale report photo forward state(s)`);
      }
      return reset;
    }
    async function publishRejectedReceiptReview(file, content, details, read, modify, config, logger) {
      if (!file || !content || !content.length || !config || !config.reviewRejectedReceipts) return "";
      try {
        let user = details && details.user;
        if (!user && file && file.userId) {
          try {
            user = await read.getUserReader().getById(file.userId);
        } catch (_6) {
          }
        }
        const { room, appUser } = await ensureReceiptReviewRoom(read, modify, config, logger), exact = details && details.exact || exactHash(content), filename = reviewReceiptFilename(file, user, exact);
        const upload = await modify.getCreator().getUploadCreator().uploadBuffer(content, {
          filename,
          room,
          user: appUser
        });
        if (!upload || !upload.id) throw new Error("Rocket.Chat did not return a review upload id");
        const mimeType = String(file && file.type || upload.type || "image/jpeg").toLowerCase(), reviewDetails = { ...(details || {}), user };
        if (!await archiveMessageExists(room.id, upload.id, read)) {
          return await createReviewMessageForUpload(upload, filename, mimeType, room, appUser, modify, logger, reviewDetails);
        }
        const reason = String(reviewDetails.reason || "чек не прошёл проверку"), master = user ? `@${user.username || user.name || user.id}` : "мастер", sourceRoom = reviewDetails.sourceRoom ? reviewDetails.sourceRoom.displayName || reviewDetails.sourceRoom.name || reviewDetails.sourceRoom.slugifiedName || "" : "", amount = Number.isFinite(Number(reviewDetails.receiptAmount)) ? `\nСумма: ${Number(reviewDetails.receiptAmount)} ₽` : "", date = reviewDetails.receiptDate ? `\nДата: ${reviewDetails.receiptDate}` : "";
        const text = `👁️ ЧЕК НА КОНТРОЛЬ\nМастер: ${master}${sourceRoom ? `\nОткуда: ${sourceRoom}` : ""}\nПричина: ${reason}${date}${amount}`;
        await modify.getCreator().finish(modify.getCreator().startMessage().setSender(appUser).setRoom(room).setText(text));
        return String(upload.id || "");
      } catch (error) {
        if (logger) logger.warn(`Could not publish rejected receipt to review room: ${error && error.message || error}`);
        return "";
      }
    }
    async function archiveUploadExists(entry, read) {
      if (!entry || !read || !read.getUploadReader) return false;
      let uploadId = String(entry.archiveUploadId || "");
      if (!uploadId && String(entry.archiveKey || "").startsWith("rocket:")) {
        uploadId = String(entry.archiveKey).slice("rocket:".length);
      }
      if (!uploadId) return false;
      try {
        const upload = await read.getUploadReader().getById(uploadId);
        if (!upload) return false;
        const actualRoomId = String(upload.roomId || upload.rid || upload.room && upload.room.id || "");
        const expectedRoomId = String(entry.archiveRoomId || "");
        if (actualRoomId && expectedRoomId && actualRoomId !== expectedRoomId) return false;
        const roomId = expectedRoomId || actualRoomId;
        if (!roomId) return false;
        return await archiveMessageExists(roomId, uploadId, read);
      } catch (_5) {
        return false;
      }
    }
    async function archiveReceipt(file, content, receiptCheck, exact, read, persistence, modify, config, logger) {
      const receiptDate = receiptCheck && receiptCheck.receiptDate || "";
      const previous = await read.getPersistenceReader().readByAssociation(archiveDayAssociation(receiptDate));
      const existingRecords = (previous || []).filter((entry) => entry && entry.archiveStatus === "stored" && entry.exact === exact);
      for (const existing of existingRecords) {
        if (await archiveUploadExists(existing, read)) return existing;
      }
      if (existingRecords.length && logger) {
        logger.warn(`Stale receipt archive metadata found for ${String(exact || "unknown").slice(0, 16)}; uploading the missing file again`);
      }
      const user = file && file.userId ? await read.getUserReader().getById(file.userId) : void 0;
      const { room, appUser } = await ensureInternalArchiveRoom(read, modify, config, logger);
      const filename = internalArchiveFilename(file, receiptCheck, user, exact);
      const upload = await modify.getCreator().getUploadCreator().uploadBuffer(content, {
        filename,
        room,
        user: appUser
      });
      if (!upload || !upload.id) throw new Error("Rocket.Chat did not return an archive upload id");
      const mimeType = String(file && file.type || upload.type || "image/jpeg").toLowerCase();
      let archiveMessageId = "";
      if (!await archiveMessageExists(room.id, upload.id, read)) {
        archiveMessageId = await createArchiveMessageForUpload(upload, filename, mimeType, room, appUser, modify, logger);
      }
      if (!await archiveMessageExists(room.id, upload.id, read)) {
        throw new Error(`Receipt upload ${upload.id} was created, but no image message appeared in ${INTERNAL_ARCHIVE_ROOM}`);
      }
      const now = Date.now();
      const archived = {
        archiveId: String(exact || upload.id || "").slice(0, 16),
        archiveKey: `rocket:${upload.id}`,
        archiveBackend: "rocket-chat-private-room-v1",
        archiveRoomId: room.id,
        archiveUploadId: upload.id,
        archiveMessageId,
        archiveUrl: String(upload.url || ""),
        archiveStatus: "stored",
        archivedAt: now,
        receiptDate,
        receiptAmount: receiptCheck && receiptCheck.receiptAmount,
        exact,
        userId: user && user.id || file && file.userId || "",
        username: user && user.username || "",
        userName: user && user.name || "",
        originalName: String(file && file.name || filename).slice(0, 180),
        mimeType,
        size: content && content.length || 0
      };
      await persistence.createWithAssociation(archived, archiveDayAssociation(archived.receiptDate));
      if (logger) logger.info(`Receipt ${archived.archiveId} stored as an image message in private Rocket.Chat room ${INTERNAL_ARCHIVE_ROOM} upload=${upload.id}`);
      return archived;
    }
    async function readArchivedReceipts(read, date) {
      const records = await read.getPersistenceReader().readByAssociation(archiveDayAssociation(date));
      return (records || []).filter((entry) => entry && entry.archiveStatus === "stored" && entry.archiveKey && !receiptArchiveExpired(entry));
    }
    function receiptArchiveExpired(entry) {
      if (!entry || entry.archiveStatus !== "stored") return false;
      const archivedAt = Number(entry.archivedAt || entry.uploadedAt || 0);
      return Boolean(archivedAt && Date.now() - archivedAt >= RECEIPT_ARCHIVE_RETENTION_MS);
    }
    function createArchiveDownloadUrl(entry, config, expiresSeconds = 3600) {
      if (entry && entry.archiveUploadId && entry.archiveUrl) return entry.archiveUrl;
      if (!entry || !entry.archiveKey || !archiveConfigured(config)) return "";
      return createArchiveSignedUrl("GET", entry.archiveBucket || config.archiveBucket, entry.archiveKey, config, expiresSeconds);
    }
    var {
      FileUploadNotAllowedException
    } = require("@rocket.chat/apps-engine/definition/exceptions");
    var {
      RocketChatAssociationModel,
      RocketChatAssociationRecord
    } = require("@rocket.chat/apps-engine/definition/metadata");
    var {
      RoomType
    } = require("@rocket.chat/apps-engine/definition/rooms");
    var PROTECTED_ROOMS = {
      otchet: {
        index: "photo-duplicate-index-v1",
        kind: "photo",
        error: "\u0424\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u044F \u0443\u0436\u0435 \u0432\u044B\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u043B\u0430\u0441\u044C. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u0443\u044E."
      },
      kassa: {
        index: "receipt-duplicate-index-v1",
        kind: "receipt",
        error: "\u042D\u0442\u043E\u0442 \u0447\u0435\u043A \u0443\u0436\u0435 \u0432\u044B\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u043B\u0441\u044F. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439."
      },
      "касса": {
        index: "receipt-duplicate-index-v1",
        kind: "receipt",
        error: "\u042D\u0442\u043E\u0442 \u0447\u0435\u043A \u0443\u0436\u0435 \u0432\u044B\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u043B\u0441\u044F. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439."
      },
      cash: {
        index: "receipt-duplicate-index-v1",
        kind: "receipt",
        error: "\u042D\u0442\u043E\u0442 \u0447\u0435\u043A \u0443\u0436\u0435 \u0432\u044B\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u043B\u0441\u044F. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439."
      },
      general: {
        index: "receipt-duplicate-index-v1",
        kind: "receipt",
        error: "\u042D\u0442\u043E\u0442 \u0447\u0435\u043A \u0443\u0436\u0435 \u0432\u044B\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u043B\u0441\u044F. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439."
      }
    };
    function protectedRoomForSlug(slug) {
      const normalized = String(slug || "").toLowerCase();
      if (!normalized || normalized === "general" || normalized === INTERNAL_ARCHIVE_ROOM || normalized === RECEIPT_REVIEW_ROOM || normalized.indexOf("arhiv") !== -1 || normalized.indexOf("архив") !== -1 || normalized.indexOf("kontrol") !== -1 || normalized.indexOf("контрол") !== -1) return void 0;
      if (PROTECTED_ROOMS[normalized]) return PROTECTED_ROOMS[normalized];
      if (normalized.indexOf("otchet") !== -1 || normalized.indexOf("отчет") !== -1 || normalized.indexOf("отчёт") !== -1) return PROTECTED_ROOMS.otchet;
      if (normalized.indexOf("kassa") !== -1 || normalized.indexOf("cash") !== -1 || normalized.indexOf("касс") !== -1) return PROTECTED_ROOMS.kassa;
      return void 0;
    }
    function isDirectRoom(room) {
      const type = String(room && room.type || "").toLowerCase();
      return type === "d" || type === "direct" || type === "direct_message" || type.indexOf("direct") !== -1;
    }
    function isMasterPrivateRoom(room) {
      const slug = String(room && room.slugifiedName || "").toLowerCase();
      const name = String(room && (room.displayName || room.name || "") || "").toLowerCase();
      return Boolean(slug.indexOf("tars-") === 0 || name.indexOf("tars") === 0);
    }
    function isPersonalTarsRoom(room) {
      return isDirectRoom(room) || isMasterPrivateRoom(room);
    }
    function isArchiveRoom(room) {
      const slug = String(room && room.slugifiedName || "").toLowerCase();
      const name = String(room && (room.displayName || room.name || "") || "").toLowerCase();
      return Boolean(slug === INTERNAL_ARCHIVE_ROOM || slug === RECEIPT_REVIEW_ROOM || slug === "receipt-archive" || slug.indexOf("arhiv") !== -1 || slug.indexOf("archive") !== -1 || slug.indexOf("kontrol") !== -1 || slug.indexOf("control") !== -1 || slug.indexOf("архив") !== -1 || slug.indexOf("контрол") !== -1 || name.indexOf("архив") !== -1 || name.indexOf("archive") !== -1 || name.indexOf("контрол") !== -1 || name.indexOf("control") !== -1);
    }
    async function isKnownArchiveRoom(room, read) {
      if (isArchiveRoom(room)) return true;
      if (!room || !room.id || !read || !read.getRoomReader) return false;
      try {
        const archiveRoom = await read.getRoomReader().getByName(INTERNAL_ARCHIVE_ROOM), reviewRoom = await read.getRoomReader().getByName(RECEIPT_REVIEW_ROOM);
        return Boolean(archiveRoom && archiveRoom.id && String(archiveRoom.id) === String(room.id) || reviewRoom && reviewRoom.id && String(reviewRoom.id) === String(room.id));
      } catch (_2) {
        return false;
      }
    }
    function protectedRoomForRoom(room) {
      if (isArchiveRoom(room)) return void 0;
      const named = protectedRoomForSlug(room && room.slugifiedName);
      if (named && named.kind !== "receipt") return named;
      const displayNamed = protectedRoomForSlug(room && (room.displayName || room.name));
      if (displayNamed && displayNamed.kind !== "receipt") return displayNamed;
      return void 0;
    }
    function messageFiles(message) {
      const files = [];
      const seen = {};
      const addFile = (file) => {
        if (!file) return;
        const id = String(file._id || file.id || file.name || file.title || "");
        if (id && seen[id]) return;
        if (id) seen[id] = true;
        files.push(file);
      };
      if (message && message.file) addFile(message.file);
      if (message && Array.isArray(message.files)) {
        for (const file of message.files) addFile(file);
      }
      if (message && Array.isArray(message.attachments)) {
        for (const attachment of message.attachments) {
          const title = attachment && attachment.title;
          const titleValue = String(title && typeof title === "object" ? title.value : title || "");
          const urls = [
            attachment && attachment.imageUrl,
            attachment && attachment.title && attachment.title.link
          ].map((value) => String(value || "")).filter(Boolean);
          for (const url of urls) {
            const uploadMatch = url.match(/(?:file-upload|Uploads|uploads)\/([^/?#]+)/i) || url.match(/[?&](?:upload|file|id)=([^&#]+)/i);
            const uploadId = uploadMatch && decodeURIComponent(uploadMatch[1] || "");
            if (!uploadId && !titleValue) continue;
            addFile({
              _id: uploadId || url,
              id: uploadId || url,
              name: titleValue || url.split("/").pop() || "photo-report.jpg",
              title: titleValue || void 0,
              type: attachment && attachment.imageUrl ? "image/jpeg" : "",
              url
            });
          }
        }
      }
      return files;
    }
    function fileLooksLikeImage(file) {
      if (!file) return false;
      const type = String(file.type || file.mimeType || "");
      if (/^image\//i.test(type)) return true;
      const name = String(file.name || file.title || file.url || file.path || "").split("?")[0].toLowerCase();
      return /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(name);
    }
    function messageImageFiles(message) {
      return messageFiles(message).filter(fileLooksLikeImage);
    }
    function messageDescriptorText(message) {
      const parts = [message && message.text];
      for (const file of messageFiles(message)) {
        parts.push(file && file.name, file && file.title);
      }
      if (message && Array.isArray(message.attachments)) {
        for (const attachment of message.attachments) {
          parts.push(attachment && attachment.text, attachment && attachment.description);
          const title = attachment && attachment.title;
          parts.push(title && typeof title === "object" ? title.value : title);
        }
      }
      return parts.filter(Boolean).join(" ");
    }
    function normalizedMessageDescriptor(message) {
      return messageDescriptorText(message).toLowerCase().replace(/ё/g, "е");
    }
    function directFileIntent(message) {
      if (!isPersonalTarsRoom(message && message.room)) return "";
      const text = normalizedMessageDescriptor(message);
      if (/рассыл|rassyl|rasbl|mailing|broadcast/.test(text)) return "mailing";
      if (/чек|перевод|квитанц|receipt|касс|kassa|сумма\s+перевод/.test(text)) return "receipt";
      if (/фото\s*отчет|фото\s*отч[её]т|фотоотчет|фотоотч[её]т|отчет\s*фото|отч[её]т\s*фото|photo\s*report/.test(text)) return "photo";
      return "";
    }
    function blocksPersonalPhotoForwardingText(text) {
      const source = String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
      if (!source) return false;
      if (looksLikeMailingProofText(source)) return true;
      const hasChatUi = /rocket\.chat|gsnvlabchat|message\s+#|заполнить\s*\/?\s*исправить\s+отчет|заполнить\s+отчет|отчет\s+мастера|сохраненный\s+отчет|отправить\s+отчет|не\s+удалось\s+отправить|спасибо\s+что|tars\s+проверит|ответ/i.test(source);
      const hasReceiptUi = /сохранить\s+(?:чек|или\s+отправить)|справка\s+по\s+операции|чек\s+по\s+операции|сбер\s*банк|сбербанк|альфа|alfa|тинькофф|t-bank|tinkoff|озон\s*банк|ozon\s*банк|газпромбанк|втб|сбп|sbp|qr[-\s]?код|сумма\s+(?:операции|перевода|платежа)|получател|отправител|назначение\s+платежа|парикмахерские\s+услуги/i.test(source);
      return Boolean(hasChatUi || hasReceiptUi);
    }
    function aiCandidateMarksReceipt(candidate) {
      const text = String(candidate && candidate.text || "");
      return Boolean(
        candidate &&
        (
          candidate.containerRejection ||
          candidate.receiptDate ||
          isValidReceiptAmount(candidate.receiptAmount) ||
          /"is_receipt"\s*:\s*true/i.test(text)
        )
      );
    }
    function aiCandidateMarksMailing(candidate) {
      const text = String(candidate && candidate.text || "");
      return Boolean(candidate && (
        /"visual_type"\s*:\s*"mailing_proof_screenshot"/i.test(text) ||
        /"is_mailing_proof"\s*:\s*true/i.test(text)
      ));
    }
    function aiCandidateMarksReportPhoto(candidate) {
      const text = String(candidate && candidate.text || "");
      const parsed = parseReceiptJson(text) || {};
      const visualType = String(parsed.visual_type || "").trim().toLowerCase();
      if (/^(?:hair_work_photo|nails_work_photo|brows_lashes_work_photo|pedicure_work_photo|work_photo)$/.test(visualType)) return true;
      if (!candidate || parsed.is_receipt !== false) return false;
      if (parsed.is_mailing_proof === true || parsed.is_screenshot_of_chat === true) return false;
      if (/^(?:bank_receipt|bank_app_screen|receipt_on_phone|qr_payment_receipt|mailing_proof_screenshot|salon_photo|chat_screenshot)$/.test(visualType)) return false;
      const serviceType = String(parsed.service_type || "").trim().toLowerCase();
      return /^(?:haircut|coloring|manicure|pedicure|brows|lashes)$/.test(serviceType);
    }
    async function isBlockedPersonalPhotoImage(file, content, http, config, logger) {
      if (!config || !content || !content.length) return false;
      let ocrChecked = false;
      let ocrReceipt = false;
      if (config.apiKey && config.folderId) {
        const models = ["page", "page-column-sort"];
        for (const model of models) {
          try {
            const payload = await requestReceiptOcr(file, content, http, config, model);
            const text = receiptOcrText(payload);
            ocrChecked = true;
            if (looksLikeMailingProofText(text)) return true;
            if (looksLikeBankReceiptText(text)) ocrReceipt = true;
          } catch (error) {
            if (logger) logger.warn(`Personal photo forwarding OCR guard failed (${model}): ${error && error.message || error}`);
          }
        }
      }
      let aiChecked = false;
      let aiReceipt = false;
      let aiMailing = false;
      let aiPhoto = false;
      if (config.openaiApiKey) {
        try {
          const aiCandidate = await requestOpenAiReceiptCheck(file, content, http, config, expectedReceiptDate(config), logger);
          if (aiCandidate) {
            aiChecked = true;
            aiReceipt = aiCandidateMarksReceipt(aiCandidate);
            aiMailing = aiCandidateMarksMailing(aiCandidate);
            aiPhoto = aiCandidateMarksReportPhoto(aiCandidate);
          }
        } catch (error) {
          if (logger) logger.warn(`Personal photo forwarding AI guard failed: ${error && error.message || error}`);
        }
      }
      if (aiMailing) return true;
      if (aiReceipt) return true;
      if (aiPhoto) return false;
      if (ocrReceipt) return true;
      if (ocrChecked || aiChecked) return false;
      return false;
    }
    async function personalImageKindForPreUpload(file, content, http, config, logger) {
      if (!config || !content || !content.length) return void 0;
      let checked = false;
      let ocrReceipt = false;
      let ocrMailing = false;
      if (config.apiKey && config.folderId) {
        const models = ["page", "page-column-sort"];
        for (const model of models) {
          try {
            const payload = await requestReceiptOcr(file, content, http, config, model);
            const text = receiptOcrText(payload);
            checked = true;
            if (looksLikeMailingProofText(text)) ocrMailing = true;
            if (looksLikeBankReceiptText(text)) ocrReceipt = true;
          } catch (error) {
            if (logger) logger.warn(`Pre-upload receipt content check failed (${model}): ${error && error.message || error}`);
          }
        }
      }
      let aiChecked = false;
      let aiReceipt = false;
      let aiMailing = false;
      let aiPhoto = false;
      if (config.openaiApiKey) {
        try {
          const aiCandidate = await requestOpenAiReceiptCheck(file, content, http, config, expectedReceiptDate(config), logger);
          if (aiCandidate) {
            checked = true;
            aiChecked = true;
            aiReceipt = aiCandidateMarksReceipt(aiCandidate);
            aiMailing = aiCandidateMarksMailing(aiCandidate);
            aiPhoto = aiCandidateMarksReportPhoto(aiCandidate);
          }
        } catch (error) {
          if (logger) logger.warn(`Pre-upload AI receipt content check failed: ${error && error.message || error}`);
        }
      }
      if (ocrMailing) return "mailing";
      if (aiMailing) return "mailing";
      if (aiReceipt) return "receipt";
      if (ocrReceipt) return "receipt";
      if (aiPhoto) return "photo";
      return "unknown";
    }
    async function personalImageIsReceiptForPreUpload(file, content, http, config, logger) {
      const kind = await personalImageKindForPreUpload(file, content, http, config, logger);
      if (kind === "receipt") return true;
      if (kind === "photo") return false;
      return void 0;
    }
    function protectedRoomForMessage(message) {
      if (!message || isArchiveRoom(message.room)) return void 0;
      if (isPersonalTarsRoom(message.room)) {
        const intent = directFileIntent(message);
        if (intent === "receipt") return PROTECTED_ROOMS.kassa;
        if (intent === "photo") return PROTECTED_ROOMS.otchet;
        return void 0;
      }
      return protectedRoomForRoom(message.room);
    }
    async function protectedRoomForPersonalFile(message, file, content, intent, fallbackProtectedRoom, http, config, logger) {
      if (!isPersonalTarsRoom(message && message.room)) return fallbackProtectedRoom;
      if (intent === "mailing") return void 0;
      // Personal receipt/photo routing is content-based. Masters do not need captions.
      const kind = await personalImageKindForPreUpload(file, content, http, config, logger);
      if (kind === "mailing") {
        if (logger) logger.info(`Personal upload classified as mailing proof by image content: room=${message.room && message.room.id || "unknown"} file=${file && (file.name || file.id) || "unknown"}`);
        return void 0;
      }
      if (kind === "receipt") {
        if (logger) logger.info(`Personal upload classified as receipt by image content: room=${message.room && message.room.id || "unknown"} file=${file && (file.name || file.id) || "unknown"}`);
        return PROTECTED_ROOMS.kassa;
      }
      if (kind === "photo") return PROTECTED_ROOMS.otchet;
      if (kind === "unknown") {
        if (logger) logger.info(`Personal upload classification unknown; keeping in personal chat for control: room=${message.room && message.room.id || "unknown"} file=${file && (file.name || file.id) || "unknown"}`);
        return void 0;
      }
      return void 0;
    }
    function normalizedUsername(value) {
      return String(value || "").trim().replace(/^@/, "").toLowerCase();
    }
    function isTarsAppMessage(message, appUser) {
      const sender = message && message.sender;
      if (!sender) return false;
      const senderUsername = normalizedUsername(sender.username || sender.name);
      const appUsername = normalizedUsername(appUser && (appUser.username || appUser.name));
      const senderId = String(sender.id || sender._id || "");
      const appUserId = String(appUser && (appUser.id || appUser._id) || "");
      const senderAppId = String(sender.appId || sender.app && (sender.app.id || sender.app._id) || "");
      return Boolean(
        senderUsername === "tars" ||
        appUsername && senderUsername === appUsername ||
        appUserId && senderId === appUserId ||
        appUserId && senderAppId === appUserId
      );
    }
    function isOwnerUser(user, config) {
      const username = normalizedUsername(user && user.username);
      return ["teimur", "shura", config && config.ownerUsername, config && config.adminUsername].some((value) => username === normalizedUsername(value));
    }
    var INDEX_VERSION = 1;
    var MAX_RECORDS = 5e3;
    var MAX_IMAGE_BYTES = 25 * 1024 * 1024;
    var MAX_DECODE_PIXELS = 24 * 1024 * 1024;
    var VISUAL_DISTANCE_LIMIT = 4;
    var RECEIPT_VISUAL_DISTANCE_LIMIT = 1;
    function indexAssociation(indexName) {
      return new RocketChatAssociationRecord(
        RocketChatAssociationModel.MISC,
        indexName
      );
    }
    function isImage(file) {
      return fileLooksLikeImage(file);
    }
    function uploadAttemptKey(file) {
      if (!file) return "";
      const value = file.uploadId || file._id || file.id;
      return value === void 0 || value === null ? "" : String(value).trim();
    }
    function exactHash(content) {
      return sha256Bytes(new Uint8Array(content));
    }
    function imageFormat(file, content) {
      const type = String(file.type || "").toLowerCase();
      const name = String(file.name || "").toLowerCase();
      if (type === "image/jpeg" || type === "image/jpg" || /\.jpe?g$/.test(name) || content.length > 2 && content[0] === 255 && content[1] === 216) {
        return "jpeg";
      }
      return "other";
    }
    function grayAt(data, width, height, x, y2) {
      const px = Math.min(width - 1, Math.max(0, Math.floor(x)));
      const py = Math.min(height - 1, Math.max(0, Math.floor(y2)));
      const offset = (py * width + px) * 4;
      return (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1e3;
    }
    function sampleGray(data, width, height, nx, ny) {
      return grayAt(data, width, height, nx * width, ny * height);
    }
    function regionStats(data, width, height, left, top, right, bottom) {
      const grid = 16;
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let y2 = 0; y2 < grid; y2 += 1) {
        for (let x = 0; x < grid; x += 1) {
          const nx = left + (x + 0.5) / grid * (right - left);
          const ny = top + (y2 + 0.5) / grid * (bottom - top);
          const value = sampleGray(data, width, height, nx, ny);
          sum += value;
          sumSq += value * value;
          count += 1;
        }
      }
      const mean = sum / count;
      return { mean, variance: Math.max(0, sumSq / count - mean * mean) };
    }
    function centralCrop(data, width, height) {
      const full = regionStats(data, width, height, 0, 0, 1, 1);
      let left = 0;
      let top = 0;
      let right = 1;
      let bottom = 1;
      const strips = [
        ["top", 0, 0, 1, 0.08],
        ["bottom", 0, 0.92, 1, 1],
        ["left", 0, 0, 0.08, 1],
        ["right", 0.92, 0, 1, 1]
      ];
      for (const [side, x1, y1, x2, y2] of strips) {
        const strip = regionStats(data, width, height, x1, y1, x2, y2);
        const flat = strip.variance < Math.max(18, full.variance * 0.05);
        const distinct = Math.abs(strip.mean - full.mean) > 18;
        if (!flat || !distinct) continue;
        if (side === "top") top = 0.08;
        if (side === "bottom") bottom = 0.92;
        if (side === "left") left = 0.08;
        if (side === "right") right = 0.92;
      }
      return { left, top, right, bottom };
    }
    function differenceHash(data, width, height, crop) {
      let bits = "";
      for (let y2 = 0; y2 < 8; y2 += 1) {
        const ny = crop.top + (y2 + 0.5) / 8 * (crop.bottom - crop.top);
        for (let x = 0; x < 8; x += 1) {
          const nx1 = crop.left + (x + 0.25) / 9 * (crop.right - crop.left);
          const nx2 = crop.left + (x + 1.25) / 9 * (crop.right - crop.left);
          bits += sampleGray(data, width, height, nx1, ny) > sampleGray(data, width, height, nx2, ny) ? "1" : "0";
        }
      }
      let hex = "";
      for (let i = 0; i < bits.length; i += 4) {
        hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
      }
      return hex;
    }
    function visualHash(file, content) {
      if (imageFormat(file, content) !== "jpeg") return void 0;
      if (content.length > MAX_IMAGE_BYTES) return void 0;
      try {
        const decoded = jpeg.decode(new Uint8Array(content), {
          useTArray: true,
          formatAsRGBA: true,
          maxResolutionInMP: 24,
          maxMemoryUsageInMB: 256
        });
        if (!decoded || !decoded.data || decoded.width < 32 || decoded.height < 32 || decoded.width * decoded.height > MAX_DECODE_PIXELS) {
          return void 0;
        }
        return differenceHash(
          decoded.data,
          decoded.width,
          decoded.height,
          centralCrop(decoded.data, decoded.width, decoded.height)
        );
      } catch (_2) {
        return void 0;
      }
    }
    function hammingDistance(left, right) {
      if (!left || !right || left.length !== right.length) return 999;
      let distance = 0;
      for (let i = 0; i < left.length; i += 1) {
        let value = parseInt(left[i], 16) ^ parseInt(right[i], 16);
        while (value) {
          distance += value & 1;
          value >>>= 1;
        }
      }
      return distance;
    }
    async function readIndex(read, indexName) {
      const records = await read.getPersistenceReader().readByAssociation(indexAssociation(indexName));
      const index = records && records.length ? records[0] : void 0;
      if (!index || index.version !== INDEX_VERSION || !Array.isArray(index.photos)) {
        return { version: INDEX_VERSION, photos: [] };
      }
      return index;
    }
    function findDuplicate(index, exact, visual) {
      return index.photos.find(
        (entry) => entry.exact === exact || visual && entry.visual && hammingDistance(visual, entry.visual) <= VISUAL_DISTANCE_LIMIT
      );
    }
    function findExactDuplicate(index, exact) {
      return index.photos.find((entry) => entry.exact === exact);
    }
    function isStableReceiptIdentity(receiptIdentity) {
      return /^(id:|txn:|text:)/.test(String(receiptIdentity || ""));
    }
    function normalizedReceiptIdentityKey(receiptIdentity) {
      const identity = String(receiptIdentity || "");
      if (identity.indexOf("txn:") !== 0) return identity;
      const parts = identity.slice(4).split("|");
      const date = parts[0] || "";
      const timeParts = String(parts[1] || "").split(":");
      const hour = String(Number(timeParts[0] || 0)).padStart(2, "0");
      const minute = String(Number(timeParts[1] || 0)).padStart(2, "0");
      const second = timeParts.length > 2 ? ":" + String(Number(timeParts[2] || 0)).padStart(2, "0") : "";
      const amount = parts[2] || "";
      return date && amount ? `txn:${date}|${hour}:${minute}${second}|${amount}` : identity;
    }
    function findReceiptIdentityDuplicate(index, receiptIdentity, ignoreEntry) {
      if (!isStableReceiptIdentity(receiptIdentity)) return void 0;
      const wanted = normalizedReceiptIdentityKey(receiptIdentity);
      return index.photos.find((entry) => {
        if (!entry || entry === ignoreEntry || !entry.receiptIdentity) return false;
        const existing = String(entry.receiptIdentity);
        if (!isStableReceiptIdentity(existing)) return false;
        const durable = entry.source === "confirmed" || entry.source === "rejected" || entry.source === "duplicate" || entry.archiveStatus === "stored" || entry.archiveKey;
        if (!durable) return false;
        return normalizedReceiptIdentityKey(existing) === wanted;
      });
    }
    function sameReceiptAmount(left, right) {
      const leftAmount = Number(left);
      const rightAmount = Number(right);
      return Number.isFinite(leftAmount) && Number.isFinite(rightAmount) && Math.abs(leftAmount - rightAmount) < 0.01;
    }
    function durableReceiptDuplicateEntry(entry) {
      return Boolean(entry && entry.source !== "pre" && entry.source !== "rejected" && (entry.source === "confirmed" || entry.source === "duplicate" || entry.archiveStatus === "stored" || entry.archiveKey));
    }
    function findReceiptVisualDuplicate(index, visual, receiptCheck, ignoreEntry) {
      return void 0;
    }
    async function writeIndex(persistence, indexName, index) {
      const association = indexAssociation(indexName);
      const photos = index.photos.slice(-MAX_RECORDS);
      await persistence.updateByAssociation(
        association,
        { version: INDEX_VERSION, photos, updatedAt: Date.now(), seededAt: index.seededAt || void 0 },
        true
      );
    }
    async function notifyDuplicateUser(user, room, protectedRoom, read, modify, logger, textOverride) {
      if (!user || !room) return;
      try {
        const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
        if (!appUser) return;
        const text = textOverride || (protectedRoom.kind === "receipt" ? "\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0427\u0415\u041A\u0410" : "\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0424\u041E\u0422\u041E");
        const notification = modify.getNotifier().getMessageBuilder().setSender(appUser).setRoom(room).setText(text).getMessage();
        await modify.getNotifier().notifyUser(user, notification);
      } catch (error) {
        if (logger) logger.warn(`Could not notify duplicate uploader: ${error && error.message || error}`);
      }
    }
    function receiptRejectionMessage(reason) {
      const clean = String(reason || "").replace(/^🚫\s*/, "").trim();
      if (/повтор\s+чека/i.test(clean)) return "🚫 ПОВТОР ЧЕКА";
      if (!clean) return "🚫 ЧЕК НЕ ПРОШЁЛ ПРОВЕРКУ";
      return `🚫 ЧЕК НЕ ПРОШЁЛ ПРОВЕРКУ\nПричина: ${clean}`;
    }
    async function deleteReceiptMessage(message, read, modify, logger) {
      if (!message || !message.id) return false;
      const userReader = read.getUserReader();
      const appUser = await userReader.getByUsername("tars") || await userReader.getAppUser();
      const candidates = [appUser, message.sender].filter(Boolean).filter((user, index, users) => users.findIndex((candidate) => String(candidate && candidate.id || "") === String(user && user.id || "")) === index);
      let lastError;
      for (const actor of candidates) {
        try {
          await modify.getDeleter().deleteMessage(message, actor);
          if (logger) logger.info(`Deleted receipt message ${message.id} as ${actor.username || actor.id || "tars"}`);
          return true;
        } catch (error) {
          lastError = error;
          if (logger) logger.warn(`Could not delete receipt message ${message.id} as ${actor.username || actor.id || "unknown"}: ${error && error.message || error}`);
        }
      }
      throw lastError || new Error(`No authorized user was available to delete receipt message ${message.id}`);
    }
    function bytesToBase64(content) {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
      let output = "";
      for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
        const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
        const value = first << 16 | second << 8 | third;
        output += alphabet[value >>> 18 & 63];
        output += alphabet[value >>> 12 & 63];
        output += index + 1 < bytes.length ? alphabet[value >>> 6 & 63] : "=";
        output += index + 2 < bytes.length ? alphabet[value & 63] : "=";
      }
      return output;
    }
    function receiptOcrText(payload) {
      const annotation = payload && payload.result && payload.result.textAnnotation || payload && payload.textAnnotation || {};
      const parts = [];
      const add = (value) => {
        const text = String(value || "").trim();
        if (text && parts.indexOf(text) === -1) parts.push(text);
      };
      add(annotation.fullText);
      add(annotation.markdown);
      for (const block of annotation.blocks || []) {
        for (const line of block && block.lines || []) add(line && line.text);
      }
      return parts.join("\n");
    }
    async function requestReceiptOcr(file, content, http, config, model, retryAttempt = 0) {
      let response;
      try {
        response = await http.post("https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText", {
          headers: {
            Authorization: "Api-Key " + config.apiKey,
            "x-folder-id": config.folderId,
            "Content-Type": "application/json"
          },
          data: {
            mimeType: String(file.type || "").toLowerCase().indexOf("png") !== -1 ? "PNG" : "JPEG",
            languageCodes: ["ru", "en"],
            model,
            content: bytesToBase64(content)
          },
          timeout: 9e3
        });
      } catch (networkError) {
        if (retryAttempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          return requestReceiptOcr(file, content, http, config, model, retryAttempt + 1);
        }
        throw networkError;
      }
      if (!response || response.statusCode < 2e2 || response.statusCode >= 3e2) {
        if (response && (response.statusCode >= 500 || response.statusCode === 429) && retryAttempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          return requestReceiptOcr(file, content, http, config, model, retryAttempt + 1);
        }
        throw new Error(`OCR HTTP ${response && response.statusCode || "unknown"} (${model})`);
      }
      return response.data || (response.content ? JSON.parse(response.content) : {});
    }
    function receiptImageMimeType(file) {
      const type = String(file && file.type || "").toLowerCase();
      if (type.indexOf("png") !== -1) return "image/png";
      if (type.indexOf("webp") !== -1) return "image/webp";
      return "image/jpeg";
    }
    function openAiReceiptOutputText(payload) {
      if (!payload) return "";
      if (payload.output_text) return String(payload.output_text);
      const parts = [];
      for (const item of payload.output || []) {
        for (const contentItem of item && item.content || []) {
          if (typeof contentItem === "string") parts.push(contentItem);
          else if (contentItem && contentItem.text) parts.push(String(contentItem.text));
          else if (contentItem && contentItem.output_text) parts.push(String(contentItem.output_text));
        }
      }
      return parts.join("\n");
    }
    function parseReceiptJson(text) {
      const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      try {
        return JSON.parse(source);
      } catch (error) {}
      const start = source.indexOf("{");
      const end = source.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(source.slice(start, end + 1));
        } catch (error) {}
      }
      return void 0;
    }
    function alignReceiptDateToRequiredYear(value, requiredDate) {
      const valueText = String(value || "");
      const required = String(requiredDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText) || !/^\d{4}-\d{2}-\d{2}$/.test(required)) return valueText || void 0;
      if (valueText.slice(5) !== required.slice(5)) return valueText;
      return required;
    }
    function normalizeOpenAiDate(value, requiredDate) {
      if (value === null || value === void 0) return void 0;
      const text = String(value).trim();
      if (!text || /^null$/i.test(text)) return void 0;
      const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
      if (iso) return alignReceiptDateToRequiredYear(normalizedDate(iso[1], iso[2], iso[3]), requiredDate);
      const dotted = text.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
      if (dotted) return alignReceiptDateToRequiredYear(normalizedDate(dotted[3], dotted[2], dotted[1]), requiredDate);
      return void 0;
    }
    function normalizeOpenAiStatus(value) {
      return String(value || "").trim().toLowerCase().replace(/ё/g, "е");
    }
    function isGazpromReceiptText(value) {
      return /газпром\s*банк|газпромбанк|gazprom\s*bank|gazprombank/i.test(String(value || ""));
    }
    function receiptAmountFromAiValue(value) {
      if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : void 0;
      return normalizeReceiptAmount(value);
    }
    function openAiReceiptCandidateFromJson(json, requiredDate) {
      if (!json || typeof json !== "object") return void 0;
      const text = JSON.stringify(json);
      const containerRejection = json.is_screenshot_of_chat === true || json.is_container_screenshot === true ? "🚫 ЧЕК НЕ ПРИНЯТ: СКРИНШОТ ЧАТА ИЛИ СТРАНИЦЫ" : "";
      if (json.is_receipt === false && !containerRejection) {
        return { text, receiptDate: void 0, receiptAmount: void 0, statusRejection: "", containerRejection: "", aiReceipt: true };
      }
      const status = normalizeOpenAiStatus(json.status);
      let statusRejection = "";
      if (/failed|cancel|error|declin|reject|not_success|неуспеш|отклон|отмен|ошиб/.test(status)) statusRejection = "🚫 ЧЕК НЕ ПРОШЁЛ ПРОВЕРКУ";
      else if (/pending|processing|ожидан|обработ/.test(status) && !isGazpromReceiptText(json.bank || text)) statusRejection = "🚫 СТАТУС ЧЕКА НЕ ПОДТВЕРЖДЁН";
      return {
        text,
        receiptDate: normalizeOpenAiDate(json.date, requiredDate),
        receiptAmount: receiptAmountFromAiValue(json.amount),
        statusRejection,
        containerRejection,
        aiReceipt: true
      };
    }
    function aiCandidateStronglyAcceptsReceipt(candidate, requiredDate) {
      if (!candidate || !candidate.aiReceipt) return false;
      if (candidate.containerRejection || receiptStatusBlocks(candidate.statusRejection)) return false;
      if (candidate.receiptDate !== requiredDate || !isValidReceiptAmount(candidate.receiptAmount)) return false;
      const text = String(candidate.text || "");
      const receiptSeen = /"is_receipt"\s*:\s*true/i.test(text);
      const receiptVisual = /"visual_type"\s*:\s*"(?:bank_receipt|bank_app_screen|receipt_on_phone|qr_payment_receipt)"/i.test(text);
      const successStatus = /"status"\s*:\s*"(?:success|успешно|исполнен|исполнено|выполнен|оплачен|completed)"/i.test(text);
      return Boolean(receiptSeen && receiptVisual && successStatus);
    }
    async function requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, retryAttempt = 0, focusAmount = false) {
      if (!config || !config.openaiApiKey || !content || !content.length) return void 0;
      const model = String(config.openaiReceiptModel || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
      const imageUrl = `data:${receiptImageMimeType(file)};base64,${bytesToBase64(content)}`;
      const amountFocusPrompt = focusAmount ? "ПОВТОРНАЯ ПРОВЕРКА СУММЫ: внимательно увеличь область с итогом и обязательно перечитай сумму операции. Ищи подписи ИТОГО, Сумма, Сумма операции, Сумма перевода, Сумма платежа, Сумма списания. Верни amount числом без пробелов и знака валюты. Не используй комиссию, баланс, время, номер карты, документа или квитанции. " : "";
      let response;
      try {
        response = await http.post("https://api.openai.com/v1/responses", {
          headers: {
            Authorization: "Bearer " + config.openaiApiKey,
            "Content-Type": "application/json"
          },
          data: {
            model,
            input: [{
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: amountFocusPrompt + "Ты проверяешь фото банковского чека салона. Верни только JSON без Markdown: {\"is_receipt\":boolean,\"has_readable_text\":boolean,\"visual_type\":\"bank_receipt|bank_app_screen|receipt_on_phone|qr_payment_receipt|mailing_proof_screenshot|hair_work_photo|nails_work_photo|brows_lashes_work_photo|pedicure_work_photo|work_photo|salon_photo|chat_screenshot|unknown\",\"is_mailing_proof\":boolean,\"service_type\":\"haircut|coloring|manicure|pedicure|brows|lashes|unknown\",\"is_screenshot_of_chat\":boolean,\"date\":\"YYYY-MM-DD|null\",\"amount\":number|null,\"status\":\"success|failed|pending|unknown\",\"bank\":\"string|null\"}. Визуальные типы чеков: PDF/белый банковский чек с логотипом банка; экран приложения банка с квитанцией; фото телефона, на котором открыт чек; QR/СБП чек; справка по операции. Визуальный тип mailing_proof_screenshot: скрин Instagram/Direct/личных сообщений со списком получателей и статусами Отправлено, Просмотрено, Sent, Seen, Delivered, либо текстом что аккаунт не может получать сообщения. Такой скрин всегда is_receipt=false и is_mailing_proof=true, это не фото работы. Визуальные типы фото работ: человек после стрижки, укладки или окрашивания = hair_work_photo; волосы крупным планом = hair_work_photo; руки/ногти/маникюр = nails_work_photo; стопы/педикюр = pedicure_work_photo; брови/ресницы/лицо крупно = brows_lashes_work_photo; интерьер салона без чека = salon_photo, это не фото выполненной работы для Otchet. is_receipt=true только если это банковский чек, квитанция, справка по операции, перевод или платеж российского банка/платежного сервиса: Сбер, Т-Банк/Тинькофф, ВТБ, Альфа, Газпромбанк, Райффайзен, Открытие, Росбанк, ПСБ, МКБ, МТС Банк, Почта Банк, Совкомбанк/Халва, Россельхозбанк, ОЗОН Банк, Уралсиб, Ак Барс, Русский Стандарт, Дом.РФ, ЮMoney, СБП/QR. Фото человека, волос, результата работы, маникюра, педикюра, бровей, ресниц или салона всегда is_receipt=false, даже если на фоне есть текст, вывеска или логотип. Не выдумывай дату или сумму. Если видишь 17.08.2026, это 2026-08-17, не 2016. Сумма - итог операции/перевода/платежа в рублях: строки ИТОГО, Сумма, Сумма операции, Сумма перевода, Сумма платежа, Сумма списания, Сумма с учетом комиссии или Сумма в валюте операции. Если видишь 1 800 RUR, 1800 RUR, 1 800 RUB, 1 800 ₽, 1 800 руб, 600 ₽, 600 Р или 600 P, amount=1800 для 1 800 и amount=600 для 600. RUR, RUB, ₽, Р и руб - это рубли. Не бери комиссию, батарею, время, номер карты, номер квитанции, адрес, телефон, код подтверждения или баланс как сумму. status=success только для Успешно, Исполнен, Исполнено, Выполнен, Оплачен, Completed, Success. status=pending для Ожидает подтверждения, В обработке, На обработке, На подпись, На подписании, К отправке, Готов к отправке, Черновик, Картотека, В дневной очереди, Поставлен в рейс, Отправлен, request_sent, created, sending, timeout, processing, pending."
                },
                { type: "input_image", image_url: imageUrl }
              ]
            }],
            max_output_tokens: 500
          },
          timeout: 14e3
        });
      } catch (networkError) {
        if (retryAttempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          return requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, retryAttempt + 1, focusAmount);
        }
        throw networkError;
      }
      if (!response || response.statusCode < 2e2 || response.statusCode >= 3e2) {
        if (response && (response.statusCode >= 500 || response.statusCode === 429) && retryAttempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          return requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, retryAttempt + 1, focusAmount);
        }
        throw new Error(`OpenAI receipt HTTP ${response && response.statusCode || "unknown"}`);
      }
      const payload = response.data || (response.content ? JSON.parse(response.content) : {});
      const parsed = parseReceiptJson(openAiReceiptOutputText(payload));
      const candidate = openAiReceiptCandidateFromJson(parsed, requiredDate);
      if (!candidate && logger) logger.warn("OpenAI receipt check returned no parseable JSON");
      return candidate;
    }
    function normalizedDate(year, month, day) {
      let numericYear = Number(year);
      const numericMonth = Number(month);
      const numericDay = Number(day);
      if (numericYear < 100) numericYear += 2e3;
      if (numericYear < 2e3 || numericYear > 21e2 || numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) return void 0;
      const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
      if (date.getUTCFullYear() !== numericYear || date.getUTCMonth() !== numericMonth - 1 || date.getUTCDate() !== numericDay) return void 0;
      return `${String(numericYear).padStart(4, "0")}-${String(numericMonth).padStart(2, "0")}-${String(numericDay).padStart(2, "0")}`;
    }
    function normalizeReceiptDateText(text) {
      const latinToCyrillic = {
        a: "а", b: "в", c: "с", e: "е", g: "г", h: "н", k: "к", l: "л", m: "м", o: "о", p: "р", r: "г", t: "т", u: "у", v: "в", x: "х", y: "у"
      };
      return String(text || "")
        .replace(/[A-Za-z]/g, (letter) => {
          const lower = letter.toLowerCase();
          return latinToCyrillic[lower] || letter;
        })
        .replace(/ё/g, "е")
        .replace(/([0-9])([A-Za-zА-Яа-я])/g, "$1 $2")
        .replace(/([A-Za-zА-Яа-я])([0-9])/g, "$1 $2")
        .replace(/\s+/g, " ");
    }
    function receiptDateDigitText(text) {
      return String(text || "")
        .replace(/[ОоO]/g, "0")
        .replace(/[ІI|l]/g, "1")
        .replace(/[Зз]/g, "3")
        .replace(/[Бб]/g, "6")
        .replace(/ё/g, "е")
        .replace(/\s+/g, " ");
    }
    function receiptFlexibleMonthWord(word) {
      return String(word || "")
        .split("")
        .map((letter) => letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[\\s.\\-:,;'’`]{0,4}");
    }
    function expectedReceiptDateSeen(text, requiredDate) {
      const required = String(requiredDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(required)) return false;
      const year = required.slice(0, 4);
      const shortYear = year.slice(2);
      const month = String(Number(required.slice(5, 7)));
      const day = String(Number(required.slice(8, 10)));
      const source = receiptDateDigitText(text);
      const separator = "[\\s.\\-/:,]{1,6}";
      const dayMonthYear = new RegExp(`(^|[^0-9])0?${day}${separator}0?${month}${separator}(?:${year}|${shortYear})(?=$|[^0-9])`, "i");
      if (dayMonthYear.test(source)) return true;
      const yearMonthDay = new RegExp(`(^|[^0-9])(?:${year}|${shortYear})${separator}0?${month}${separator}0?${day}(?=$|[^0-9])`, "i");
      if (yearMonthDay.test(source)) return true;
      const monthWords = {
        "01": ["янв", "январ"],
        "02": ["фев", "феврал"],
        "03": ["мар", "март"],
        "04": ["апр", "апрел"],
        "05": ["мая", "май"],
        "06": ["июн"],
        "07": ["июл"],
        "08": ["авг", "ауг", "август"],
        "09": ["сен", "сент"],
        "10": ["окт"],
        "11": ["ноя", "нояб"],
        "12": ["дек"]
      }[required.slice(5, 7)] || [];
      if (monthWords.length) {
        const word = `(?:${monthWords.join("|")})[а-я.]*`;
        const wordPattern = new RegExp(`(^|[^0-9])0?${day}\\s+${word}\\s+(?:${year}|${shortYear})(?=$|[^0-9])`, "i");
        if (wordPattern.test(source)) return true;
        const fullMonthWords = {
          "01": ["январ"], "02": ["феврал"], "03": ["март"],
          "04": ["апрел"], "05": ["мая", "май"], "06": ["июн"],
          "07": ["июл"], "08": ["август", "аугуст"], "09": ["сентябр"],
          "10": ["октябр"], "11": ["ноябр"], "12": ["декабр"]
        }[required.slice(5, 7)] || [];
        const flexibleWord = `(?:${monthWords.concat(fullMonthWords).map(receiptFlexibleMonthWord).join("|")})[а-я.]*`;
        const near = "[\\s\\S]{0,90}";
        const fuzzyDayMonthYear = new RegExp(`(^|[^0-9])0?${day}${near}${flexibleWord}${near}(?:${year}|${shortYear})(?=$|[^0-9])`, "i");
        if (fuzzyDayMonthYear.test(source)) return true;
        const fuzzyYearMonthDay = new RegExp(`(^|[^0-9])(?:${year}|${shortYear})${near}${flexibleWord}${near}0?${day}(?=$|[^0-9])`, "i");
        if (fuzzyYearMonthDay.test(source)) return true;
      }
      return false;
    }
    function receiptMonthFromToken(value) {
      const token = String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-я]/g, "");
      if (!token) return void 0;
      if (token === "мая" || token === "май") return 5;
      if (token.indexOf("янв") === 0) return 1;
      if (token.indexOf("фев") === 0) return 2;
      if (token.indexOf("мар") === 0) return 3;
      if (token.indexOf("апр") === 0) return 4;
      if (token.indexOf("июн") === 0) return 6;
      if (token.indexOf("июл") === 0) return 7;
      if (token.indexOf("авг") === 0 || token.indexOf("ауг") === 0) return 8;
      if (token.indexOf("сен") === 0 || token.indexOf("сент") === 0) return 9;
      if (token.indexOf("окт") === 0) return 10;
      if (token.indexOf("ноя") === 0 || token.indexOf("нояб") === 0) return 11;
      if (token.indexOf("дек") === 0) return 12;
      return void 0;
    }
    function extractReceiptDate(text, requiredDate = "") {
      const source = normalizeReceiptDateText(text);
      const required = /^\d{4}-\d{2}-\d{2}$/.test(String(requiredDate || "")) ? String(requiredDate) : "";
      const russianMonths = {
        "\u044f\u043d\u0432\u0430\u0440\u044f": 1, "\u044f\u043d\u0432\u0430\u0440\u044c": 1,
        "\u0444\u0435\u0432\u0440\u0430\u043b\u044f": 2, "\u0444\u0435\u0432\u0440\u0430\u043b\u044c": 2,
        "\u043c\u0430\u0440\u0442\u0430": 3, "\u043c\u0430\u0440\u0442": 3,
        "\u0430\u043f\u0440\u0435\u043b\u044f": 4, "\u0430\u043f\u0440\u0435\u043b\u044c": 4,
        "\u043c\u0430\u044f": 5, "\u043c\u0430\u0439": 5,
        "\u0438\u044e\u043d\u044f": 6, "\u0438\u044e\u043d\u044c": 6,
        "\u0438\u044e\u043b\u044f": 7, "\u0438\u044e\u043b\u044c": 7,
        "\u0430\u0432\u0433\u0443\u0441\u0442\u0430": 8, "\u0430\u0432\u0433\u0443\u0441\u0442": 8,
        "\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f": 9, "\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044c": 9,
        "\u043e\u043a\u0442\u044f\u0431\u0440\u044f": 10, "\u043e\u043a\u0442\u044f\u0431\u0440\u044c": 10,
        "\u043d\u043e\u044f\u0431\u0440\u044f": 11, "\u043d\u043e\u044f\u0431\u0440\u044c": 11,
        "\u0434\u0435\u043a\u0430\u0431\u0440\u044f": 12, "\u0434\u0435\u043a\u0430\u0431\u0440\u044c": 12
      };
      const candidates = [];
      const scoreContext = (index, length) => {
        const before = source.slice(Math.max(0, index - 90), index).toLowerCase();
        const around = source.slice(Math.max(0, index - 90), Math.min(source.length, index + length + 70)).toLowerCase();
        let score = 0;
        if (/(дата|операц|сформирован|чек|платеж|перевод|оплат|исполнен|справк)/.test(around)) score += 40;
        if (/(дата|операц|сформирован|чек|платеж|перевод|оплат|исполнен|справк)[^0-9]{0,50}$/.test(before)) score += 35;
        if (/(телефон|счет|карта|код|инн|бик|квитанц|номер)/.test(around)) score -= 15;
        return score;
      };
      const addCandidate = (value, index, length, baseScore) => {
        const alignedValue = alignReceiptDateToRequiredYear(value, required);
        if (!alignedValue) return;
        candidates.push({ value: alignedValue, score: baseScore + scoreContext(index, length), index });
      };
      const monthNames = Object.keys(russianMonths).join("|");
      const labeledNumeric = /(?:дата(?:\s+и\s+время)?\s+(?:операции|платежа)|дата\s+чека|сформирован[ао]?|справка\s+по\s+операции|чек\s+по\s+операции|исполнен[оа]?)[^\d]{0,70}(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})/gi;
      let match;
      while ((match = labeledNumeric.exec(source))) {
        addCandidate(normalizedDate(match[3], match[2], match[1]), match.index, match[0].length, 90);
      }
      const labeledRussian = new RegExp(
        "(?:дата(?:\\s+и\\s+время)?\\s+(?:операции|платежа)|дата\\s+чека|сформирован[ао]?|справка\\s+по\\s+операции|чек\\s+по\\s+операции|исполнен[оа]?)[^0-9]{0,70}(\\d{1,2})\\s+(" + monthNames + ")\\s+(\\d{4})",
        "gi"
      );
      while ((match = labeledRussian.exec(source))) {
        addCandidate(normalizedDate(match[3], russianMonths[match[2].toLowerCase()], match[1]), match.index, match[0].length, 90);
      }
      const russianPattern = new RegExp("(\\d{1,2})\\s+(" + monthNames + ")\\s+(\\d{4})", "gi");
      while ((match = russianPattern.exec(source))) {
        addCandidate(normalizedDate(match[3], russianMonths[match[2].toLowerCase()], match[1]), match.index, match[0].length, 25);
      }
      const fuzzyMonthWithYear = /\b(\d{1,2})\s+([а-я.]{3,16})\s+(20\d{2})\b/gi;
      while ((match = fuzzyMonthWithYear.exec(source))) {
        const month = receiptMonthFromToken(match[2]);
        addCandidate(month ? normalizedDate(match[3], month, match[1]) : void 0, match.index, match[0].length, 20);
      }
      const numeric = /(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})/g;
      while ((match = numeric.exec(source))) {
        addCandidate(normalizedDate(match[3], match[2], match[1]), match.index, match[0].length, 15);
      }
      const spacedWithTime = /\b(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+(\d{1,2})[:.]\d{2}/g;
      while ((match = spacedWithTime.exec(source))) {
        addCandidate(normalizedDate(match[3], match[2], match[1]), match.index, match[0].length, 10);
      }
      if (required) {
        const requiredCandidates = candidates.filter((candidate) => candidate.value === required);
        if (requiredCandidates.length) {
          requiredCandidates.sort((a, b) => b.score - a.score || a.index - b.index);
          return requiredCandidates[0].value;
        }
      }
      const byDate = candidates.reduce((acc, candidate) => {
        const current = acc[candidate.value];
        if (!current || candidate.score > current.score) acc[candidate.value] = candidate;
        return acc;
      }, {});
      const unique = Object.keys(byDate).map((value) => byDate[value]).sort((a, b) => b.score - a.score || a.index - b.index);
      if (unique.length === 1) return unique[0].value;
      if (unique.length && unique[0].score >= 80 && unique[0].score - unique[1].score >= 20) return unique[0].value;
      return void 0;
    }
    function normalizeReceiptAmount(raw) {
      if (!/\d/.test(String(raw || ""))) return void 0;
      const compact = String(raw || "").replace(/[ОоO]/g, "0").replace(/[Бб]/g, "6").replace(/[Зз]/g, "3").replace(/[ІI|l]/g, "1").replace(/[\s\u00a0']/g, "");
      if (!compact || !/\d/.test(compact)) return void 0;
      const comma = compact.lastIndexOf(",");
      const dot = compact.lastIndexOf(".");
      const separator = Math.max(comma, dot);
      let normalized;
      if (separator !== -1 && compact.length - separator - 1 <= 2) {
        normalized = compact.slice(0, separator).replace(/[^0-9]/g, "") + "." + compact.slice(separator + 1).replace(/[^0-9]/g, "");
      } else {
        normalized = compact.replace(/[^0-9]/g, "");
      }
      const value = Number(normalized);
      return Number.isFinite(value) && value > 0 && value < 1e8 ? Math.round(value * 100) / 100 : void 0;
    }
    function extractReceiptAmount(text) {
      const raw = String(text || "").replace(/\u00a0/g, " ");
      const source = raw.replace(/[₽]/g, " ₽ ").replace(/\s+/g, " ");
      const ocrSource = source.replace(/[СC][УY][МM][МM][АA]/gi, "сумма").replace(/пepeвoд|nepeвод|перев0д/gi, "перевод");
      const digit = "[0-9ОоOБбЗзІI|l]";
      const number = "(" + digit + "{1,9}(?:[ \\u00a0.'’]" + digit + "{3})*(?:[.,]" + digit + "{1,2})?)";
      const signedNumber = "([+\\-−–—]?\\s*" + digit + "{1,9}(?:[ \\u00a0.'’]" + digit + "{3})*(?:[.,]" + digit + "{1,2})?)";
      const currency = "(?:₽|[РрPp]\\.?|руб\\.?|руб(?:лей|ля)?|rub|rur|рубл|pyб|pу6|ру6|py6|рур)";
      const amountBoundary = "(?=$|\\s|[.,;:!?)]|[А-Яа-яA-Za-z])";
      const cleanAmount = (value) => {
        const amount = normalizeReceiptAmount(value);
        return amount !== void 0 && amount > 0 ? amount : void 0;
      };
      const scoreAmountContext = (context) => {
        const lower = String(context || "").toLowerCase().replace(/ё/g, "е");
        let score = 0;
        if (/сумма\s+в\s+(?:валюте\s+)?операции/.test(lower)) score += 40;
        if (/итого|итоговая\s+сумма|к\s+оплате|amount|total/.test(lower)) score += 35;
        if (/сумма\s+(?:операции|перевода|платежа|зачисления|списания|с\s+уч[её]том\s+комисс)/.test(lower)) score += 30;
        if (/операция\s+на\s+сумму|оплата\s+через|оплата\s+по\s+qr|сбп|sbp|qr/.test(lower)) score += 20;
        if (/руб|₽|rub|rur/.test(lower)) score += 8;
        if (/комисс/.test(lower)) score -= /с\s+уч[её]том\s+комисс/.test(lower) ? 3 : 30;
        if (/баланс|остаток|доступно|лимит|телефон|адрес|москва|moscow|ул\.|улица|карта\s+\*{2,}|счет\s+\*{2,}|код\s+подтверждения|номер\s+квитанц/.test(lower)) score -= 20;
        return score;
      };
      const prioritizedAmounts = [];
      const pushAmountMatch = (match, pattern) => {
        const value = match && cleanAmount(match[1]);
        if (value === void 0 || value <= 0 || value > 5e5) return;
        const start = Math.max(0, match.index - 120);
        const end = Math.min(ocrSource.length, pattern.lastIndex + 120);
        prioritizedAmounts.push({ value, score: scoreAmountContext(ocrSource.slice(start, end)), index: match.index });
      };
      const directAmountPattern = new RegExp(number + "\\s*" + currency + amountBoundary, "gi");
      let directAmountMatch;
      while ((directAmountMatch = directAmountPattern.exec(ocrSource))) pushAmountMatch(directAmountMatch, directAmountPattern);
      const reversedAmountPattern = new RegExp(currency + "\\s*" + number, "gi");
      let reversedAmountMatch;
      while ((reversedAmountMatch = reversedAmountPattern.exec(ocrSource))) {
        const value = cleanAmount(reversedAmountMatch[1]);
        if (value === void 0 || value <= 0 || value > 5e5) continue;
        const start = Math.max(0, reversedAmountMatch.index - 120);
        const end = Math.min(ocrSource.length, reversedAmountPattern.lastIndex + 120);
        prioritizedAmounts.push({ value, score: scoreAmountContext(ocrSource.slice(start, end)), index: reversedAmountMatch.index });
      }
      if (prioritizedAmounts.length) {
        prioritizedAmounts.sort((left, right) => right.score - left.score || right.value - left.value || left.index - right.index);
        if (prioritizedAmounts[0].score >= 10) return prioritizedAmounts[0].value;
      }
      const ozonLike = /(ozon\s*банк|ozonbank|озон\s*банк|озонбанк)/i.test(ocrSource);
      if (ozonLike) {
        const ozonAmounts = [];
        const ozonPattern = new RegExp(number + "\\s*" + currency + amountBoundary, "gi");
        let ozonMatch;
        while ((ozonMatch = ozonPattern.exec(ocrSource))) {
          const value = cleanAmount(ozonMatch[1]);
          if (value === void 0 || value <= 0 || value > 5e5) continue;
          const context = ocrSource.slice(Math.max(0, ozonMatch.index - 90), ozonPattern.lastIndex + 90).toLowerCase().replace(/ё/g, "е");
          let score = 1;
          if (/итого|сумма|перевод|операци/.test(context)) score += 6;
          if (/комисс/.test(context)) score -= 5;
          ozonAmounts.push({ value, score, index: ozonMatch.index });
        }
        if (ozonAmounts.length) {
          ozonAmounts.sort((left, right) => right.score - left.score || right.value - left.value || left.index - right.index);
          return ozonAmounts[0].value;
        }
      }
      const keywordPatterns = [
        new RegExp("(?:сумма\\s+в\\s+(?:валюте\\s+)?операции|сумма\\s+(?:операции|перевода|платежа|зачисления|списания|с\\s+уч[её]том\\s+комисс(?:ии)?)|сумма|итого(?:\\s+к\\s+оплате)?|операция\\s+на\\s+сумму|оплата\\s+через\\s+alfa\\s+pay)[^0-9ОоO]{0,160}" + number + "\\s*" + currency + "?", "i"),
        new RegExp("(?:сумма\\s+в\\s+(?:валюте\\s+)?операции|сумма\\s+(?:операции|перевода|платежа|зачисления|списания|с\\s+уч[её]том\\s+комисс(?:ии)?)|сумма|итого(?:\\s+к\\s+оплате)?|операция\\s+на\\s+сумму|оплата\\s+через\\s+alfa\\s+pay)[\\s\\S]{0,160}?" + currency + "\\s*" + number, "i")
      ];
      for (const pattern of keywordPatterns) {
        const match = pattern.exec(ocrSource);
        const value = match && cleanAmount(match[1]);
        if (value !== void 0) return value;
      }
      const lines = raw.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].toLowerCase().replace(/ё/g, "е");
        if (!/(сумма|итого|валюте\s+операции|операци|перевод|платеж)/i.test(line)) continue;
        const windowText = [lines[index], lines[index + 1] || "", lines[index + 2] || ""].join(" ");
        const currencyMatch = new RegExp(signedNumber + "\\s*" + currency + amountBoundary, "i").exec(windowText) || new RegExp(currency + "\\s*" + number, "i").exec(windowText);
        const amount = currencyMatch && cleanAmount(currencyMatch[1]);
        if (amount !== void 0) return amount;
        if (!/(сумма|итого|валюте\s+операции)/i.test(line)) continue;
        const plainMatch = new RegExp(number, "i").exec(windowText);
        const plain = plainMatch && cleanAmount(plainMatch[1]);
        if (plain !== void 0) return plain;
      }
      const patterns = [
        new RegExp("\\b" + number + "\\s*" + currency + amountBoundary, "i"),
        new RegExp(currency + "\\s*" + number, "i"),
        new RegExp(signedNumber + "\\s*" + currency + amountBoundary, "i")
      ];
      for (const pattern of patterns) {
        const match = pattern.exec(ocrSource);
        const value = match && cleanAmount(match[1]);
        if (value !== void 0) return value;
      }
      const bankLike = ozonLike || /(сбер|sber|альфа|alfa|тинькофф|t-bank|tinkoff|т-банк|справка\s+по\s+операции|операци[яи]\s+совершена|квитанц|sbp|сбп|bank)/i.test(ocrSource);
      if (bankLike) {
        const currencyAmounts = [];
        const amountPattern = new RegExp(number + "\\s*" + currency + amountBoundary, "gi");
        let match;
        while ((match = amountPattern.exec(ocrSource))) {
          const value = cleanAmount(match[1]);
          if (value !== void 0 && value > 0 && value <= 5e5) currencyAmounts.push(value);
        }
        if (currencyAmounts.length) {
          currencyAmounts.sort((left, right) => right - left);
          return currencyAmounts[0];
        }
      }
      return void 0;
    }
    function textFingerprint(text) {
      const source = String(text || "").toUpperCase().replace(/[^A-ZА-Я0-9]/g, "");
      let hash = 2166136261;
      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    }
    function extractReceiptIdentity(text, receiptDate, receiptAmount) {
      const source = String(text || "").replace(/\s+/g, " ");
      const documentNumber = /(?:номер\s+(?:документа|чека|квитанции)|код\s+авторизации)[^A-Za-zА-Яа-я0-9]{0,24}([A-Za-zА-Яа-я0-9-]{4,})/i.exec(source);
      if (documentNumber && /\d/.test(documentNumber[1])) {
        const value = documentNumber[1].replace(/[^A-Za-zА-Яа-я0-9]/g, "").toUpperCase();
        return "id:DOC" + value + "|" + String(receiptDate || "") + "|" + String(receiptAmount || "");
      }
      const operationId = /(?:id|ид|идентификатор|номер|код)\s+(?:операции|транзакции|документа|платежа|авторизации)(?:\s+в\s+сбп)?[^A-Za-zА-Яа-я0-9]{0,24}([A-Za-zА-Яа-я0-9-]{6,})/i.exec(source);
      if (operationId && /\d/.test(operationId[1])) {
        const value = operationId[1].replace(/[^A-Za-zА-Яа-я0-9]/g, "").toUpperCase();
        return "id:" + value + "|" + String(receiptDate || "") + "|" + String(receiptAmount || "");
      }
      const receiptNumber = /(?:квитанц(?:ия|ии)?|чек)\s*(?:№|#|n[oо]?\.?|номер)?\s*[:\-]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9-]{5,})/i.exec(source);
      if (receiptNumber && /\d/.test(receiptNumber[1])) {
        const value = receiptNumber[1].replace(/[^A-Za-zА-Яа-я0-9]/g, "").toUpperCase();
        return "id:RECEIPT" + value + "|" + String(receiptDate || "") + "|" + String(receiptAmount || "");
      }
      const dateAndTime = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\s*[, ]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(source);
      if (!receiptDate || receiptAmount === void 0) return void 0;
      if (!dateAndTime) return `text:${receiptDate}|${receiptAmount}|${textFingerprint(source)}`;
      const hour = String(Number(dateAndTime[4])).padStart(2, "0");
      const minute = String(Number(dateAndTime[5])).padStart(2, "0");
      const second = dateAndTime[6] !== void 0 ? ":" + String(Number(dateAndTime[6])).padStart(2, "0") : "";
      return `txn:${receiptDate}|${hour}:${minute}${second}|${receiptAmount}`;
    }
    function receiptStatusRejection(text) {
      const source = String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
      if (/успешно|исполнен[ао]?|выполнен[ао]?|оплачен[ао]?|платеж\s+выполнен|перевод\s+выполнен|зачислен[ао]?|completed|success|successful|approved/i.test(source)) {
        return "";
      }
      if (/ожидает\s+(?:подтверждения|обработки|исполнения)|в\s+обработке|на\s+обработке|на\s+проверке|на\s+подпис(?:ь|ании)|к\s+отправке|готов\s+к\s+отправке|черновик|картотек|дневн\w*\s+очеред|поставлен\s+в\s+рейс|отправлен|платеж\s+(?:создан|обрабатывается)|request_sent|created|sending|timeout|processing|pending/i.test(source) && !isGazpromReceiptText(source)) {
        return "🚫 ПЛАТЕЖ НЕ ПОДТВЕРЖДЁН — СУММА НЕ ЗАСЧИТАНА";
      }
      if (/отказ|отменен|отклонен|не\s+выполнен|неуспеш|ошибка\s+(?:платежа|операции)|rejected|failed|declined|error/i.test(source)) {
        return "🚫 ПЛАТЕЖ НЕ ВЫПОЛНЕН";
      }
      return "";
    }
    function receiptContainerScreenshotRejection(text) {
      const source = String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
      const hasChatUi = /rocket\.chat|gsnvlabchat|kassa_gsnvlabpro|cheki-arhiv|cheki-kontrol|заполнить\s*\/?\s*исправить\s+отчет|заполнить\s+отчет|отчет\s+мастера|сумма\s+переводов|message\s+#|tars/i.test(source);
      const hasReceipt = looksLikeBankReceiptText(source);
      return hasChatUi && hasReceipt ? "🚫 ОТПРАВЬТЕ САМ ЧЕК, НЕ СКРИН СТРАНИЦЫ" : "";
    }
    function looksLikeBankReceiptText(text) {
      const source = String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
      const document = /чек\s+(?:по\s+)?операци[ии]|справка\s+по\s+операции|квитанц|электронн(?:ый|ая)\s+чек|receipt|payment\s+receipt|подтверждение\s+(?:операции|платежа|перевода)|детали\s+(?:операции|платежа|перевода)/i.test(source);
      const bank = /сбер\s*банк|сбербанк|sber(?:bank)?|т[-\s]?банк|тинькофф|t[-\s]?bank|tinkoff|втб|vtb|альфа(?:[-\s]?банк)?|alfa|alpha\s*bank|газпромбанк|gazprombank|райффайзен|raiffeisen|росбанк|rosbank|открытие|open\s*bank|ozon\s*банк|ozonbank|озон\s*банк|озонбанк|псб|промсвязьбанк|promsvyaz|мкб|московский\s+кредитный\s+банк|mts\s*bank|мтс\s*банк|почта\s*банк|post\s*bank|совкомбанк|sovcombank|халва|россельхозбанк|рсхб|rshb|ак\s*барс|ak\s*bars|уралсиб|uralsib|ренессанс\s*банк|renaissance|русский\s+стандарт|russian\s+standard|дом\.?\s*рф|dom\.?\s*rf|юmoney|юмoney|юмани|yoomoney|банк\s+(?:получателя|получател|списания)/i.test(source);
      const operation = /(?:тип|вид)\s+операции|операци[ия]|плат[её]ж|перевод|покупка|оплата|сбп|sbp|qr[-\s]?код|куар[-\s]?код|плати\s*qr|плати\s+куар/i.test(source);
      const money = /(?:^|[^а-яa-z])(?:итого|сумма|к\s+оплате|amount|total)(?:[^а-яa-z]|$)|\d[\d\s.,']{0,12}\s*(?:₽|р\.?|руб\.?|rub|rur)\b/i.test(source);
      const party = /получател|отправител|плательщик|назначение\s+платежа|реквизит[ыа]\s+(?:получателя|платежа)|инн|кпп|мсс|mcc|наименование\s+(?:тст|юл|ип)|торгов(?:ая|ой)\s+точк|merchant/i.test(source);
      const status = /статус\s+(?:операции|платежа|перевода)|успешно|исполнен|выполнен|ожидает\s+подтверждения|в\s+обработке|отклонен|отменен/i.test(source);
      const date = /дата\s+(?:и\s+время\s+)?(?:операции|платежа|перевода)|\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/i.test(source);
      const cardOrAccount = /(?:карта|счет|сч[её]т)\s+(?:списания|зачисления|получателя)|\*{2,}\s*\d{4}|\d{4}\s*\*{2,}/i.test(source);
      let score = 0;
      if (document) score += 3;
      if (bank) score += 2;
      if (operation) score += 1;
      if (money) score += 2;
      if (party) score += 1;
      if (status) score += 1;
      if (date) score += 1;
      if (cardOrAccount) score += 1;
      return Boolean(
        document && (money || bank || operation) ||
        bank && operation && (money || party || status || date || cardOrAccount) ||
        money && party && (status || date || cardOrAccount) ||
        score >= 5
      );
    }
    function looksLikeMailingProofText(text) {
      const source = String(text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
      if (!source) return false;
      const directUi = /instagram|инстаграм|direct|директ|сообщени[ея]|аккаунт\s+не\s+может\s+получать|не\s+может\s+получать\s+ваши|камера|отправить\s+сообщение/i.test(source);
      const sentState = /отправлено|просмотрено|доставлено|sent|seen|viewed|delivered/i.test(source);
      const timeAgo = /\b\d+\s*(?:ч|час|часа|часов|h|hr|hrs)\.?\s+назад\b|\b\d+\s*(?:мин|м|min)\.?\s+назад\b/i.test(source);
      const repeatedStates = (source.match(/отправлено|просмотрено|sent|seen|viewed|delivered/g) || []).length >= 2;
      const accountList = (source.match(/[a-zа-я0-9_.]{3,}\s+(?:отправлено|просмотрено|sent|seen|viewed|delivered)/g) || []).length >= 2;
      return Boolean(
        /аккаунт\s+не\s+может\s+получать|не\s+может\s+получать\s+ваши/i.test(source) ||
        sentState && timeAgo && (directUi || repeatedStates || accountList) ||
        repeatedStates && accountList
      );
    }
    async function isReceiptLikeImage(file, content, http, config, logger) {
      if (!config || !config.apiKey || !config.folderId || !content || !content.length) return false;
      const models = ["page", "page-column-sort"];
      for (const model of models) {
        try {
          const payload = await requestReceiptOcr(file, content, http, config, model);
          if (looksLikeBankReceiptText(receiptOcrText(payload))) return true;
        } catch (error) {
          if (logger) logger.warn(`Receipt-like OCR detection failed (${model}): ${error && error.message || error}`);
        }
      }
      return false;
    }
    function receiptStatusBlocks(reason) {
      const text = String(reason || "");
      return Boolean(text && text.indexOf("⚠️") !== 0);
    }
    function localCalendarParts(timestamp, config) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: config && config.timeZone || "Europe/Astrakhan",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(new Date(Number(timestamp || Date.now())));
      const values = {};
      for (const part of parts) values[part.type] = part.value;
      return {
        date: `${values.year}-${values.month}-${values.day}`,
        hour: Number(values.hour || 0) % 24,
        minute: Number(values.minute || 0)
      };
    }
    function personalChatCleanupReady(now, config) {
      const local = localCalendarParts(now, config);
      return local.hour >= 12;
    }
    function personalChatMessageIsExpired(createdAt, now, config) {
      if (!createdAt || !personalChatCleanupReady(now, config)) return false;
      const messageWorkday = workdayForTimestamp(createdAt, config);
      const currentWorkday = workdayForTimestamp(now, config);
      return Boolean(messageWorkday && currentWorkday && messageWorkday < currentWorkday);
    }
    function workdayForTimestamp(timestamp, config) {
      const cutoffHour = Math.min(12, Math.max(0, Number(config.cutoffHour) || 4));
      const shifted = new Date(Number(timestamp || Date.now()) - cutoffHour * 60 * 60 * 1e3);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: config.timeZone || "Europe/Astrakhan",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(shifted);
      const values = {};
      for (const part of parts) values[part.type] = part.value;
      return `${values.year}-${values.month}-${values.day}`;
    }
    function expectedWorkday(config) {
      return workdayForTimestamp(Date.now(), config);
    }
    function receiptCalendarDateForTimestamp(timestamp, config) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: config && config.timeZone || "Europe/Astrakhan",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date(Number(timestamp || Date.now())));
      const values = {};
      for (const part of parts) values[part.type] = part.value;
      return `${values.year}-${values.month}-${values.day}`;
    }
    function expectedReceiptDate(config) {
      return receiptCalendarDateForTimestamp(Date.now(), config);
    }
    function displayDate(value) {
      const parts = String(value || "").split("-");
      return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : String(value || "");
    }
    function isValidReceiptAmount(value) {
      const amount = Number(value);
      return Number.isFinite(amount) && amount > 0;
    }
    async function validateReceiptDate(file, content, http, config, logger, retryAttempt = 0) {
      if (!config) {
        return { ok: false, reason: "🚫 ПРОВЕРКА ДАТЫ ЧЕКА НЕ НАСТРОЕНА" };
      }
      const requiredDate = expectedReceiptDate(config);
      const hasYandex = Boolean(config.apiKey && config.folderId);
      const hasOpenAi = Boolean(config.openaiApiKey);
      if (!hasYandex && !hasOpenAi) {
        return { ok: false, reason: "🚫 ПРОВЕРКА ДАТЫ ЧЕКА НЕ НАСТРОЕНА" };
      }
      const candidates = [];
      const failures = [];
      const addCombinedCandidate = () => {
        const sourceCandidates = candidates.filter((candidate) => !candidate.combinedReceipt);
        if (sourceCandidates.length <= 1) return;
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
          if (candidates[index].combinedReceipt) candidates.splice(index, 1);
        }
        const combinedText = sourceCandidates.map((candidate) => candidate.text).join("\n");
        candidates.push({
          text: combinedText,
          receiptDate: extractReceiptDate(combinedText, requiredDate),
          receiptAmount: extractReceiptAmount(combinedText),
          statusRejection: receiptStatusRejection(combinedText),
          containerRejection: receiptContainerScreenshotRejection(combinedText),
          combinedReceipt: true
        });
      };
      const mergeCandidateForDecision = (base) => {
        if (!base) return void 0;
        if (isValidReceiptAmount(base.receiptAmount)) return base;
        const amountCandidate = candidates.find((candidate) => {
          if (!isValidReceiptAmount(candidate.receiptAmount)) return false;
          return !candidate.receiptDate || !base.receiptDate || candidate.receiptDate === base.receiptDate;
        });
        if (!amountCandidate) return base;
        return {
          text: [base.text, amountCandidate.text].filter(Boolean).join("\n"),
          receiptDate: base.receiptDate,
          receiptAmount: amountCandidate.receiptAmount,
          statusRejection: base.statusRejection || amountCandidate.statusRejection || "",
          containerRejection: base.containerRejection || amountCandidate.containerRejection || "",
          aiReceipt: base.aiReceipt || amountCandidate.aiReceipt,
          mergedReceipt: true
        };
      };
      const returnContainer = () => {
        const containerCandidate = mergeCandidateForDecision(candidates.find((candidate) => candidate.containerRejection));
        if (!containerCandidate) return void 0;
        return {
          ok: false,
          reason: containerCandidate.containerRejection,
          receiptDate: containerCandidate.receiptDate,
          receiptAmount: containerCandidate.receiptAmount,
          receiptIdentity: extractReceiptIdentity(containerCandidate.text, containerCandidate.receiptDate, containerCandidate.receiptAmount)
        };
      };
      const returnAccepted = () => {
        const accepted = mergeCandidateForDecision(candidates.find((candidate) => candidate.receiptDate === requiredDate && !receiptStatusBlocks(candidate.statusRejection)));
        if (!accepted || !isValidReceiptAmount(accepted.receiptAmount) || receiptStatusBlocks(accepted.statusRejection)) return void 0;
        return {
          ok: true,
          receiptDate: accepted.receiptDate,
          receiptAmount: accepted.receiptAmount,
          receiptIdentity: extractReceiptIdentity(accepted.text, accepted.receiptDate, accepted.receiptAmount),
          receiptWarning: accepted.statusRejection || ""
        };
      };
      const returnStatus = () => {
        const statusCandidate = mergeCandidateForDecision(candidates.find((candidate) => receiptStatusBlocks(candidate.statusRejection)));
        if (!statusCandidate) return void 0;
        return {
          ok: false,
          reason: statusCandidate.statusRejection,
          receiptDate: statusCandidate.receiptDate,
          receiptAmount: statusCandidate.receiptAmount,
          receiptIdentity: extractReceiptIdentity(statusCandidate.text, statusCandidate.receiptDate, statusCandidate.receiptAmount)
        };
      };
      try {
        if (hasYandex) {
          for (const model of ["page", "page-column-sort", "table", "markdown"]) {
            try {
              const payload = await requestReceiptOcr(file, content, http, config, model);
              const text = receiptOcrText(payload);
              if (text) candidates.push({
                text,
                receiptDate: extractReceiptDate(text, requiredDate),
                receiptAmount: extractReceiptAmount(text),
                statusRejection: receiptStatusRejection(text),
                containerRejection: receiptContainerScreenshotRejection(text)
              });
            } catch (modelError) {
              failures.push(String(modelError && modelError.message || modelError));
            }
            const current = candidates[candidates.length - 1];
            if (current && current.receiptDate === requiredDate && isValidReceiptAmount(current.receiptAmount)) break;
          }
          addCombinedCandidate();
        }
        if (hasOpenAi) {
          try {
            const aiCandidate = await requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger);
            if (aiCandidate) candidates.push(aiCandidate);
            if (!aiCandidate || !isValidReceiptAmount(aiCandidate.receiptAmount)) {
              const amountCandidate = await requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, 0, true);
              if (amountCandidate) candidates.push(amountCandidate);
            }
          } catch (aiError) {
            failures.push(String(aiError && aiError.message || aiError));
            if (logger) logger.warn(`OpenAI receipt double-check failed: ${aiError && aiError.message || aiError}`);
          }
          addCombinedCandidate();
        }
        const hardContainer = returnContainer();
        if (hardContainer) return hardContainer;
        const strongOpenAiAccepted = candidates.find((candidate) => aiCandidateStronglyAcceptsReceipt(candidate, requiredDate));
        if (strongOpenAiAccepted) return {
          ok: true,
          receiptDate: strongOpenAiAccepted.receiptDate,
          receiptAmount: strongOpenAiAccepted.receiptAmount,
          receiptIdentity: extractReceiptIdentity(strongOpenAiAccepted.text, strongOpenAiAccepted.receiptDate, strongOpenAiAccepted.receiptAmount),
          receiptWarning: strongOpenAiAccepted.statusRejection || ""
        };
        const hardStatus = returnStatus();
        if (hardStatus) return hardStatus;
        const accepted = returnAccepted();
        if (accepted) return accepted;
        const correctDate = mergeCandidateForDecision(candidates.find((candidate) => candidate.receiptDate === requiredDate));
        if (correctDate) return {
          ok: false,
          reason: "🚫 СУММА ЧЕКА НЕ РАСПОЗНАНА",
          receiptDate: correctDate.receiptDate,
          receiptAmount: correctDate.receiptAmount,
          receiptIdentity: extractReceiptIdentity(correctDate.text, correctDate.receiptDate, correctDate.receiptAmount)
        };
        const dated = mergeCandidateForDecision(candidates.find((candidate) => candidate.receiptDate));
        if (dated) {
          return {
            ok: false,
            reason: `🚫 ДАТА ЧЕКА ${displayDate(dated.receiptDate)}, НУЖНА ${displayDate(requiredDate)}`,
            receiptDate: dated.receiptDate,
            receiptAmount: dated.receiptAmount,
            receiptIdentity: extractReceiptIdentity(dated.text, dated.receiptDate, dated.receiptAmount)
          };
        }
        if (!candidates.length && failures.length) throw new Error(failures.join("; "));
        return { ok: false, reason: "🚫 ДАТА ЧЕКА НЕ РАСПОЗНАНА" };
      } catch (error) {
        const errorText = String(error && error.message || error);
        if (errorText.indexOf("OCR HTTP 429") !== -1 && retryAttempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1300 * (retryAttempt + 1)));
          return validateReceiptDate(file, content, http, config, logger, retryAttempt + 1);
        }
        if (logger) logger.warn(`Receipt date OCR failed: ${errorText}`);
        return { ok: false, reason: "🚫 НЕ УДАЛОСЬ ПРОВЕРИТЬ ДАТУ ЧЕКА" };
      }
    }
    async function validateReceiptStrict(file, content, http, config, logger) {
      // OCR is deliberately executed after Rocket.Chat has finished the file
      // upload. The pre-upload hook stays local and fast, otherwise the mobile
      // client can time out while it is still showing "Upload in progress".
      // One complete OCR result remains strict: missing/old date, missing
      // amount and bad status are never confirmed or copied to the archive.
      return validateReceiptDate(file, content, http, config, logger, 0);
    }
    function personalArchiveMessageAssociation(messageId) {
      return new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `personal-chat-archive:${String(messageId || "")}`);
    }
    async function archiveTextMessageOnce(oldMessage, room, read, persistence, modify, config, logger) {
      if (!oldMessage || !oldMessage.id || !oldMessage.text || !String(oldMessage.text).trim()) return true;
      if (!persistence) return false;
      const association = personalArchiveMessageAssociation(oldMessage.id);
      const previous = await read.getPersistenceReader().readByAssociation(association);
      if ((previous || []).some((entry) => entry && entry.archiveStatus === "stored" && entry.messageId === oldMessage.id)) return true;
      const archived = await archiveTextMessage(oldMessage, room, read, modify, config, logger);
      if (!archived) return false;
      await persistence.createWithAssociation({
        messageId: oldMessage.id,
        roomId: room && room.id || "",
        archiveStatus: "stored",
        archivedAt: Date.now()
      }, association);
      return true;
    }
    function personalReportPhotoWasForwarded(entry) {
      if (!entry) return false;
      if (entry.reportUploadId) return true;
      const reportMessageId = String(entry.reportMessageId || "");
      if (reportMessageId === "duplicate") return true;
      if (!reportMessageId || reportMessageId === "publishing") return false;
      if (/^(?:blocked|failed)/i.test(reportMessageId)) return false;
      return true;
    }
    function acceptedReceiptEntry(entry) {
      if (!entry) return false;
      return entry.source !== "pre" && entry.source !== "invalid" && entry.source !== "rejected" && entry.source !== "archive_failed" && entry.source !== "duplicate" && Boolean(entry.receiptDate || entry.receiptIdentity);
    }
    async function archiveAndCleanupPersonalRoomAtNoon(room, read, persistence, modify, config, logger, now = Date.now()) {
      if (!room || !isPersonalTarsRoom(room) || !read || !persistence || !modify || !config || !config.archiveEnabled) return 0;
      if (!personalChatCleanupReady(now, config)) return 0;
      const receiptIndex = await readIndex(read, PROTECTED_ROOMS.kassa.index);
      const photoIndex = await readIndex(read, PROTECTED_ROOMS.otchet.index);
      let deleted = 0;
      let receiptIndexChanged = false;
      for (let page = 0; page < 20; page += 1) {
        const messages = await read.getRoomReader().getMessages(room.id, {
          limit: 100,
          skip: 0,
          sort: { createdAt: "asc" },
          showThreadMessages: true
        });
        if (!messages || !messages.length) break;
        let foundExpired = false;
        let deletedThisPage = 0;
        for (const oldMessage of messages) {
          const createdAt = oldMessage && oldMessage.createdAt ? new Date(oldMessage.createdAt).getTime() : 0;
          if (!personalChatMessageIsExpired(createdAt, now, config)) continue;
          foundExpired = true;
          if (!oldMessage.id || !oldMessage.sender) continue;
          const files = messageImageFiles(oldMessage);
          let imagesSafe = true;
          const receiptEntriesForMessage = [];
          for (const messageFile of files) {
            const uploadId = String(messageFile && (messageFile._id || messageFile.id) || "");
            if (!uploadId) {
              imagesSafe = false;
              break;
            }
            let receiptEntry = (receiptIndex.photos || []).find((entry) => entry && (String(entry.messageId || "") === String(oldMessage.id) || String(entry.uploadId || "") === uploadId) && acceptedReceiptEntry(entry));
            let upload;
            let content;
            let exact = receiptEntry && receiptEntry.exact || "";
            if (!receiptEntry) {
              try {
                content = await read.getUploadReader().getBufferById(uploadId);
                exact = exactHash(content);
                const exactEntry = findExactDuplicate(receiptIndex, exact);
                if (acceptedReceiptEntry(exactEntry)) receiptEntry = exactEntry;
              } catch (_8) {
              }
            }
            if (receiptEntry) {
              try {
                if (!content) content = await read.getUploadReader().getBufferById(uploadId);
                if (!upload) upload = await read.getUploadReader().getById(uploadId);
                exact = exact || receiptEntry.exact || exactHash(content);
                if (!receiptEntry.archiveKey || receiptEntry.archiveStatus !== "stored" || !await archiveUploadExists(receiptEntry, read)) {
                  const archived = await archiveReceipt({
                    ...messageFile,
                    name: messageFile.name || upload && upload.name || "receipt.jpg",
                    type: messageFile.type || upload && upload.type || "image/jpeg",
                    userId: receiptEntry.userId || oldMessage.sender && oldMessage.sender.id || ""
                  }, content, {
                    receiptDate: receiptEntry.receiptDate || dateFromEntry(receiptEntry, config),
                    receiptAmount: amountFromEntry(receiptEntry),
                    receiptIdentity: receiptEntry.receiptIdentity
                  }, exact, read, persistence, modify, config, logger);
                  if (!archived || archived.archiveStatus !== "stored" || !archived.archiveKey) throw new Error("Rocket.Chat receipt archive did not confirm storage");
                  Object.assign(receiptEntry, archived);
                  receiptEntry.source = "confirmed";
                  receiptEntry.invalidReason = "";
                  receiptIndexChanged = true;
                }
                if (!receiptEntry.archiveKey || receiptEntry.archiveStatus !== "stored" || !await archiveUploadExists(receiptEntry, read)) {
                  imagesSafe = false;
                  break;
                }
                receiptEntriesForMessage.push(receiptEntry);
                continue;
              } catch (error) {
                imagesSafe = false;
                if (logger) logger.warn(`Could not archive personal receipt before noon cleanup ${oldMessage.id}: ${error && error.message || error}`);
                break;
              }
            }
            const photoEntry = (photoIndex.photos || []).find((entry) => entry && (String(entry.messageId || entry.sourceMessageId || "") === String(oldMessage.id) || String(entry.uploadId || "") === uploadId));
            if (!personalReportPhotoWasForwarded(photoEntry)) {
              imagesSafe = false;
              if (logger) logger.warn(`Personal image ${uploadId} was not archived as a receipt or confirmed in Otchet; keeping source message ${oldMessage.id}`);
              break;
            }
          }
          if (!imagesSafe) continue;
          if (!await archiveTextMessageOnce(oldMessage, room, read, persistence, modify, config, logger)) continue;
          if (!oldMessage.room || !oldMessage.room.id || String(oldMessage.room.id) !== String(room.id)) continue;
          try {
            await modify.getDeleter().deleteMessage(oldMessage, oldMessage.sender);
            const deletedAt = Date.now();
            for (const receiptEntry of receiptEntriesForMessage) {
              receiptEntry.chatDeletedAt = deletedAt;
              receiptIndexChanged = true;
            }
            deleted += 1;
            deletedThisPage += 1;
          } catch (error) {
            if (logger) logger.warn(`Could not delete archived personal message ${oldMessage.id}: ${error && error.message || error}`);
          }
        }
        if (!foundExpired || !deletedThisPage || messages.length < 100) break;
      }
      if (receiptIndexChanged) await writeIndex(persistence, PROTECTED_ROOMS.kassa.index, receiptIndex);
      if (deleted && logger) logger.info(`Archived and deleted ${deleted} prior-day personal messages from ${room.id} after 12:00`);
      return deleted;
    }
    async function cleanupExpiredMasterRoom(room, currentUser, read, modify, config, logger) {
      if (!room || !isPersonalTarsRoom(room)) return 0;
      // Legacy callers may still request cleanup after message events. Keep
      // them aligned with the dedicated noon job: nothing is removed before
      // 12:00 local time, and only messages from an earlier workday qualify.
      const cleanupNow = Date.now();
      if (!personalChatCleanupReady(cleanupNow, config)) return 0;
      const archiveIndex = config && config.archiveEnabled ? await readIndex(read, PROTECTED_ROOMS.kassa.index) : null;
      let deleted = 0;
      for (let page = 0; page < 10; page += 1) {
        const messages = await read.getRoomReader().getMessages(room.id, {
          limit: 100,
          skip: 0,
          sort: { createdAt: "asc" },
          showThreadMessages: true
        });
        if (!messages || !messages.length) break;
        let foundExpired = false;
        for (const oldMessage of messages) {
          const createdAt = oldMessage && oldMessage.createdAt ? new Date(oldMessage.createdAt).getTime() : 0;
          if (!personalChatMessageIsExpired(createdAt, cleanupNow, config)) continue;
          foundExpired = true;
          if (!oldMessage.id || !oldMessage.sender) continue;
          const oldFiles = [];
          if (oldMessage.file) oldFiles.push(oldMessage.file);
          if (Array.isArray(oldMessage.files)) oldFiles.push(...oldMessage.files);
          const hasReceiptImage = oldFiles.some((file) => file && /^image\//i.test(String(file.type || "")));
          if (hasReceiptImage && archiveIndex) {
            const safelyArchived = archiveIndex.photos.some((entry) => entry && entry.messageId === oldMessage.id && entry.archiveStatus === "stored" && entry.archiveKey);
            if (!safelyArchived) continue;
          }
          if (!hasReceiptImage && config && config.archiveEnabled) {
            const archived = await archiveTextMessage(oldMessage, room, read, modify, config, logger);
            if (!archived) continue;
          }
          if (!oldMessage.room || !oldMessage.room.id || String(oldMessage.room.id) !== String(room.id)) continue;
          try {
            await modify.getDeleter().deleteMessage(oldMessage, oldMessage.sender);
            deleted += 1;
          } catch (error) {
            if (logger) logger.warn(`Could not delete expired private master message ${oldMessage.id}: ${error && error.message || error}`);
          }
        }
        if (!foundExpired || messages.length < 100) break;
      }
      if (deleted && logger) logger.info(`Deleted ${deleted} expired private master messages from ${room.id}`);
      return deleted;
    }
    async function cleanupArchivedReceiptMessages(room, read, persistence, modify, logger, config) {
      if (!room || !read || !persistence || !modify) return 0;
      const index = await readIndex(read, PROTECTED_ROOMS.kassa.index), now = Date.now();
      let deleted = 0, changed = false;
      const deletedMessageIds = {};
      for (const entry of index.photos) {
        if (!entry || entry.chatDeletedAt || !entry.messageId) continue;
        if (entry.source === "pre" || entry.source === "invalid" || entry.source === "rejected" || entry.source === "duplicate") continue;
        if (!entry.receiptDate && !entry.receiptIdentity) continue;
        const dueAt = receiptArchiveDueAt(entry);
        if (!dueAt || dueAt > now) continue;
        try {
          const message = await read.getMessageReader().getById(entry.messageId);
          if (!message) {
            if (entry.archiveStatus === "stored" && entry.archiveKey) {
              entry.chatDeletedAt = Date.now();
              changed = true;
            } else if (logger) {
              logger.warn(`Receipt ${entry.messageId} is due for archive but the Kassa message is missing`);
            }
            continue;
          }
          if (!message.room || message.room.id !== room.id) continue;
          if (!entry.archiveKey || entry.archiveStatus !== "stored" || !await archiveUploadExists(entry, read)) {
            const files = messageImageFiles(message);
            const preferredUploadId = String(entry.uploadId || "");
            const messageFile = files.find((file) => String(file && (file._id || file.id) || "") === preferredUploadId) || files[0];
            const messageFileId = String(messageFile && (messageFile._id || messageFile.id) || "");
            if (!messageFileId) {
              if (logger) logger.warn(`Receipt ${entry.messageId} is due for archive but no image upload was found`);
              continue;
            }
            const upload = await read.getUploadReader().getById(messageFileId);
            const content = await read.getUploadReader().getBufferById(messageFileId);
            const exact = entry.exact || exactHash(content);
            const archived = await archiveReceipt(
              {
                ...messageFile,
                name: messageFile.name || upload && upload.name || "receipt.jpg",
                type: messageFile.type || upload && upload.type || "image/jpeg",
                userId: entry.userId || message.sender && message.sender.id || ""
              },
              content,
              {
                receiptDate: entry.receiptDate,
                receiptAmount: entry.receiptAmount,
                receiptIdentity: entry.receiptIdentity
              },
              exact,
              read,
              persistence,
              modify,
              config || {},
              logger
            );
            if (!archived || archived.archiveStatus !== "stored" || !archived.archiveKey) throw new Error("Rocket.Chat receipt archive did not confirm storage");
            Object.assign(entry, archived);
            entry.source = "confirmed";
            entry.invalidReason = "";
            changed = true;
          }
          if (!entry.archiveKey || entry.archiveStatus !== "stored") continue;
          await deleteReceiptMessage(message, read, modify, logger);
          entry.chatDeletedAt = Date.now();
          deletedMessageIds[String(message.id || entry.messageId)] = true;
          changed = true;
          deleted += 1;
        } catch (error) {
          if (logger) logger.warn(`Could not archive/delete receipt message ${entry.messageId}: ${error && error.message || error}`);
        }
      }
      let skip = 0;
      while (skip < 2e3) {
        const messages = await read.getRoomReader().getMessages(room.id, {
          limit: 100,
          skip,
          sort: { createdAt: "desc" },
          showThreadMessages: true
        });
        if (!messages || !messages.length) break;
        for (const oldMessage of messages) {
          const createdAt = oldMessage && oldMessage.createdAt ? new Date(oldMessage.createdAt).getTime() : 0;
          if (!createdAt || createdAt + RECEIPT_ARCHIVE_DELAY_MS > now) continue;
          const oldMessageId = String(oldMessage && oldMessage.id || "");
          if (!oldMessageId || deletedMessageIds[oldMessageId]) continue;
          const files = messageImageFiles(oldMessage);
          for (const messageFile of files) {
            const messageFileId = String(messageFile && (messageFile._id || messageFile.id) || "");
            if (!messageFileId) continue;
            try {
              const upload = await read.getUploadReader().getById(messageFileId);
              const content = await read.getUploadReader().getBufferById(messageFileId);
              const exact = exactHash(content);
              const entry = findExactDuplicate(index, exact);
              if (!entry || entry.chatDeletedAt) continue;
              if (entry.source === "pre" || entry.source === "invalid" || entry.source === "rejected" || entry.source === "duplicate") continue;
              const dueAt = receiptArchiveDueAt(entry) || createdAt + RECEIPT_ARCHIVE_DELAY_MS;
              if (dueAt > now) continue;
              entry.messageId = oldMessageId;
              entry.uploadId = messageFileId;
              entry.roomId = room.id;
              entry.uploadedAt = entry.uploadedAt || createdAt;
              entry.userId = oldMessage.sender && oldMessage.sender.id || entry.userId || "";
              entry.username = oldMessage.sender && oldMessage.sender.username || entry.username || "";
              entry.userName = oldMessage.sender && oldMessage.sender.name || entry.userName || "";
              if (!entry.receiptDate) entry.receiptDate = dateFromEntry(entry, config || {});
              if (!entry.archiveKey || entry.archiveStatus !== "stored" || !await archiveUploadExists(entry, read)) {
                const receiptAmount = amountFromEntry(entry);
                const archived = await archiveReceipt(
                  {
                    ...messageFile,
                    name: messageFile.name || upload && upload.name || "receipt.jpg",
                    type: messageFile.type || upload && upload.type || "image/jpeg",
                    userId: entry.userId || oldMessage.sender && oldMessage.sender.id || ""
                  },
                  content,
                  {
                    receiptDate: entry.receiptDate || receiptCalendarDateForTimestamp(createdAt, config || {}),
                    receiptAmount,
                    receiptIdentity: entry.receiptIdentity
                  },
                  exact,
                  read,
                  persistence,
                  modify,
                  config || {},
                  logger
                );
                if (!archived || archived.archiveStatus !== "stored" || !archived.archiveKey) throw new Error("Rocket.Chat receipt archive did not confirm storage");
                Object.assign(entry, archived);
                entry.source = "confirmed";
                entry.invalidReason = "";
              }
              if (!entry.archiveKey || entry.archiveStatus !== "stored") continue;
              await deleteReceiptMessage(oldMessage, read, modify, logger);
              entry.chatDeletedAt = Date.now();
              deletedMessageIds[oldMessageId] = true;
              changed = true;
              deleted += 1;
              break;
            } catch (error) {
              if (logger) logger.warn(`Could not backfill archive/delete receipt message ${oldMessageId || "unknown"}: ${error && error.message || error}`);
            }
          }
        }
        skip += messages.length;
        if (messages.length < 100) break;
      }
      if (changed) await writeIndex(persistence, PROTECTED_ROOMS.kassa.index, index);
      if (deleted && logger) logger.info(`Archived and deleted ${deleted} Kassa receipt messages older than 24 hours`);
      return deleted;
    }
    async function cleanupExpiredReceiptArchive(read, persistence, modify, logger) {
      if (!read || !persistence || !modify) return 0;
      const index = await readIndex(read, PROTECTED_ROOMS.kassa.index);
      let archiveRoom;
      try {
        archiveRoom = await read.getRoomReader().getByName(INTERNAL_ARCHIVE_ROOM);
      } catch (_6) {
        archiveRoom = void 0;
      }
      const expiredDates = {};
      let deleted = 0, changed = false;
      for (const entry of index.photos) {
        if (!receiptArchiveExpired(entry)) continue;
        const date = String(entry.receiptDate || "");
        if (date) expiredDates[date] = true;
        try {
          let message;
          if (entry.archiveMessageId) {
            message = await read.getMessageReader().getById(entry.archiveMessageId);
          }
          if (!message && archiveRoom && entry.archiveUploadId) {
            message = await findArchiveMessageByUploadId(archiveRoom.id, entry.archiveUploadId, read);
          }
          if (message && message.id && message.room && (!archiveRoom || message.room.id === archiveRoom.id)) {
            await deleteReceiptMessage(message, read, modify, logger);
            deleted += 1;
          }
        } catch (error) {
          if (logger) logger.warn(`Could not delete expired receipt archive ${entry.archiveMessageId || entry.archiveUploadId || entry.archiveKey}: ${error && error.message || error}`);
        }
        entry.archiveStatus = "expired";
        entry.archiveDeletedAt = Date.now();
        entry.archiveKey = "";
        changed = true;
      }
      for (const date of Object.keys(expiredDates)) {
        try {
          await persistence.removeByAssociation(archiveDayAssociation(date));
        } catch (error) {
          if (logger) logger.warn(`Could not remove expired receipt archive metadata for ${date}: ${error && error.message || error}`);
        }
      }
      if (changed) await writeIndex(persistence, PROTECTED_ROOMS.kassa.index, index);
      if ((deleted || changed) && logger) logger.info(`Expired ${Object.keys(expiredDates).length} receipt archive day(s); deleted ${deleted} archive messages older than 90 days`);
      return deleted;
    }
    async function findResultRoom(read, config) {
      const configuredName = String(config && config.resultRoomName || "").trim();
      if (!configuredName) return void 0;
      const normalized = configuredName.toLowerCase();
      if (normalized === "general" || normalized.indexOf("kassa") !== -1 || normalized.indexOf("cash") !== -1 || normalized.indexOf("касс") !== -1) return void 0;
      const names = [configuredName].filter(Boolean);
      for (const name of names) {
        try {
          const room = await read.getRoomReader().getByName(String(name));
          if (room) return room;
        } catch (_2) {
        }
      }
      return void 0;
    }
    async function publishAcceptedReceipt(entry, message, read, modify, config, logger) {
      if (!entry || entry.resultMessageId || !message || !message.sender) return false;
      if (!isValidReceiptAmount(entry.receiptAmount)) return false;
      const room = isPersonalTarsRoom(message.room) ? message.room : await findResultRoom(read, config);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) {
        if (logger) logger.warn("Could not publish accepted receipt: target room or app user not found");
        return false;
      }
      const dateText = entry.receiptDate ? displayDate(String(entry.receiptDate)) : "—";
      const amount = Number(entry.receiptAmount);
      const amountText = Number.isFinite(amount) ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount) : "—";
      const username = message.sender.username ? `@${message.sender.username}` : message.sender.name || message.sender.id;
      const archiveText = entry.archiveKey && entry.archiveStatus === "stored" ? "\nАрхив: сохранено" : "";
      const warningText = entry.receiptWarning ? `\nПроверка: ${entry.receiptWarning}` : "";
      const text = `✅ ЧЕК ПРИНЯТ\nМастер: ${username}\nДата: ${dateText}\nСумма: ${amountText} ₽${warningText}${archiveText}`;
      const builder = modify.getCreator().startMessage().setSender(appUser).setRoom(room).setText(text);
      const resultId = await modify.getCreator().finish(builder);
      entry.resultRoomId = room.id;
      entry.resultMessageId = resultId || "published";
      entry.publishedAt = Date.now();
      return true;
    }
    async function rememberOrBlockPersonalImageDuplicate(file, content, room, fileUser, read, persistence, logger) {
      const exact = exactHash(content);
      const visual = visualHash(file, content);
      const indexName = "personal-image-duplicate-index-v1";
      const index = await readIndex(read, indexName);
      const now = Date.now();
      index.photos = index.photos.filter((entry) => !entry.expiresAt || Number(entry.expiresAt || 0) > now);
      const duplicate = findDuplicate(index, exact, visual);
      if (duplicate) {
        if (logger) logger.info(`Blocked duplicate personal image for user ${file && file.userId || "unknown"}`);
        throw new FileUploadNotAllowedException("\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0424\u041E\u0422\u041E/\u0427\u0415\u041A\u0410");
      }
      index.photos.push({
        exact,
        visual,
        source: "personal-unknown",
        uploadedAt: now,
        userId: file && file.userId || "",
        username: fileUser && fileUser.username || "",
        userName: fileUser && fileUser.name || "",
        roomId: room && room.id || "",
        uploadId: String(file && (file._id || file.id || file.name) || ""),
        expiresAt: now + 24 * 60 * 60 * 1e3
      });
      await writeIndex(persistence, indexName, index);
    }
    async function rememberOrDeletePostedPersonalImageDuplicate(message, file, content, read, persistence, modify, logger) {
      if (!message || !isPersonalTarsRoom(message.room) || !file || !content || !content.length) return false;
      const exact = exactHash(content);
      const visual = visualHash(file, content);
      const indexName = "personal-image-duplicate-index-v1";
      const index = await readIndex(read, indexName);
      const now = Date.now();
      const uploadId = String(file && (file._id || file.id || file.name) || "");
      index.photos = index.photos.filter((entry) => !entry.expiresAt || Number(entry.expiresAt || 0) > now);
      const duplicate = findDuplicate(index, exact, visual);
      const sameFreshPreUploadMarker = Boolean(
        duplicate &&
        duplicate.source === "personal-unknown" &&
        !duplicate.messageId &&
        !duplicate.postProcessedAt &&
        String(duplicate.roomId || "") === String(message.room && message.room.id || "") &&
        String(duplicate.userId || "") === String(message.sender && message.sender.id || "") &&
        now - Number(duplicate.uploadedAt || 0) < 2 * 60 * 1e3
      );
      if (duplicate && !sameFreshPreUploadMarker && String(duplicate.uploadId || "") !== uploadId) {
        await writeIndex(persistence, indexName, index);
        if (message.id && message.sender) {
          await deleteReceiptMessage(message, read, modify, logger);
          await notifyDuplicateUser(message.sender, message.room, PROTECTED_ROOMS.kassa, read, modify, logger, "\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0424\u041E\u0422\u041E/\u0427\u0415\u041A\u0410");
        }
        if (logger) logger.info(`Deleted posted duplicate personal image ${message.id || "unknown"} upload=${uploadId || "unknown"}`);
        return true;
      }
      const entry = duplicate || {
        exact,
        visual,
        source: "personal-post",
        uploadedAt: now
      };
      entry.exact = entry.exact || exact;
      entry.visual = entry.visual || visual;
      entry.userId = message.sender && message.sender.id || entry.userId || "";
      entry.username = message.sender && message.sender.username || entry.username || "";
      entry.userName = message.sender && message.sender.name || entry.userName || "";
      entry.roomId = message.room && message.room.id || entry.roomId || "";
      entry.messageId = message.id || entry.messageId || "";
      entry.uploadId = uploadId || entry.uploadId || "";
      entry.postProcessedAt = now;
      entry.expiresAt = now + 24 * 60 * 60 * 1e3;
      if (!duplicate) index.photos.push(entry);
      await writeIndex(persistence, indexName, index);
      return false;
    }
    async function guardUpload(context, read, persistence, modify, logger, http, ocrConfig) {
      const file = context && context.file;
      const content = context && context.content;
      if (!isImage(file) || !content || !content.length) return;
      const room = await read.getRoomReader().getById(file.rid);
      if (!room) return;
      if (await isKnownArchiveRoom(room, read)) return;
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (appUser && String(file.userId || "") === String(appUser.id || "")) return;
      let fileUser;
      try {
        fileUser = file && file.userId ? await read.getUserReader().getById(file.userId) : void 0;
      } catch (_2) {
        fileUser = void 0;
      }
      if (isPersonalTarsRoom(room)) {
        await rememberOrBlockPersonalImageDuplicate(file, content, room, fileUser, read, persistence, logger);
      }
      let protectedRoom = protectedRoomForRoom(room);
      if (!protectedRoom && isPersonalTarsRoom(room)) {
        // Locked routing rule: masters send an image only; TARS decides by receipt-like content.
        const personalImageKind = await personalImageKindForPreUpload(file, content, http, ocrConfig, logger);
        if (personalImageKind === "mailing") {
          if (logger) logger.info(`Personal upload classified as mailing proof before publication: room=${room.id || "unknown"} file=${file.name || file.id || "unknown"}`);
          const mailingWorkday = workdayForTimestamp(Date.now(), ocrConfig || {});
          const mailingAssociation = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `mailing-proof-index:${mailingWorkday}`);
          await persistence.createWithAssociation({
            userId: file.userId || "",
            username: fileUser && fileUser.username || "",
            userName: fileUser && fileUser.name || "",
            roomId: room.id,
            uploadId: String(file._id || file.id || file.name || ""),
            workday: mailingWorkday,
            source: "ocr",
            createdAt: Date.now()
          }, mailingAssociation);
          return;
        } else if (personalImageKind === "receipt") {
          protectedRoom = PROTECTED_ROOMS.kassa;
          if (logger) logger.info(`Personal upload classified as receipt by pre-upload receipt content: room=${room.id || "unknown"} file=${file.name || file.id || "unknown"}`);
        } else if (personalImageKind === "photo") {
          protectedRoom = PROTECTED_ROOMS.otchet;
          if (logger) logger.info(`Personal upload classified as report photo before publication: room=${room.id || "unknown"} file=${file.name || file.id || "unknown"}`);
        } else {
          if (logger) logger.info(`Personal upload was not confirmed as report work photo before publication; keeping it in personal chat: room=${room.id || "unknown"} file=${file.name || file.id || "unknown"}`);
          return;
        }
      }
      if (!protectedRoom) return;
      // Keep this hook fast. Rocket.Chat mobile can abort an upload while an
      // external OCR request is still running. Exact duplicates are rejected
      // here; OCR, receipt-identity checks and archiving run after publication.
      const exact = exactHash(content);
      const visual = visualHash(file, content);
      const index = await readIndex(read, protectedRoom.index);
      const now = Date.now();
      const pendingTtl = 15 * 60 * 1e3;
      index.photos = index.photos.filter((entry) => entry.source !== "pre" || now - Number(entry.uploadedAt || 0) < pendingTtl);
      let exactMatch = findExactDuplicate(index, exact);
      const attemptKey = uploadAttemptKey(file);
      const pendingAge = exactMatch ? now - Number(exactMatch.uploadedAt || 0) : Number.POSITIVE_INFINITY;
      const sameStableAttempt = Boolean(attemptKey && exactMatch && exactMatch.uploadAttemptKey === attemptKey);
      const samePendingRetry = Boolean(
        exactMatch &&
        exactMatch.source === "pre" &&
        sameStableAttempt &&
        exactMatch.userId === (file.userId || "") &&
        exactMatch.roomId === room.id
      );
      const receiptNeedsRecheck = Boolean(
        protectedRoom.kind === "receipt" &&
        exactMatch &&
        (
          exactMatch.source === "pre" && sameStableAttempt ||
          (exactMatch.source === "rejected" || exactMatch.source === "duplicate") && !isStableReceiptIdentity(exactMatch.receiptIdentity)
        )
      );
      let reusableEntry = samePendingRetry || receiptNeedsRecheck ? exactMatch : void 0;
      let duplicate = protectedRoom.kind === "receipt" ? reusableEntry ? void 0 : exactMatch : reusableEntry ? void 0 : exactMatch;
      if (duplicate) {
        if (logger) logger.info(`Blocked duplicate ${protectedRoom.kind} for user ${file.userId || "unknown"}`);
        const rejectionText = protectedRoom.kind === "receipt" && duplicate.source === "rejected" && duplicate.invalidReason ? receiptRejectionMessage(duplicate.invalidReason) : protectedRoom.kind === "receipt" ? "\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0427\u0415\u041A\u0410" : "\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0424\u041E\u0422\u041E";
        throw new FileUploadNotAllowedException(rejectionText);
      }
      let preReceiptCheck;
      if (protectedRoom.kind === "receipt") {
        preReceiptCheck = await validateReceiptStrict(file, content, http, ocrConfig, logger);
        if (!preReceiptCheck.ok) {
          const entry = reusableEntry || {};
          entry.exact = exact;
          entry.visual = visual;
          entry.source = "rejected";
          entry.receiptIdentity = preReceiptCheck.receiptIdentity || entry.receiptIdentity || "";
          entry.receiptDate = preReceiptCheck.receiptDate || entry.receiptDate || "";
          entry.receiptAmount = preReceiptCheck.receiptAmount !== void 0 ? preReceiptCheck.receiptAmount : entry.receiptAmount;
          entry.invalidReason = receiptRejectionMessage(preReceiptCheck.reason || "receipt validation failed");
          entry.validationVersion = 11;
          entry.uploadedAt = reusableEntry ? Number(entry.uploadedAt || now) : now;
          entry.uploadAttemptKey = attemptKey || entry.uploadAttemptKey || "";
          entry.userId = file.userId || "";
          entry.username = fileUser && fileUser.username || entry.username || "";
          entry.userName = fileUser && fileUser.name || entry.userName || "";
          entry.roomId = room.id;
          if (!reusableEntry) index.photos.push(entry);
          await writeIndex(persistence, protectedRoom.index, index);
          await publishRejectedReceiptReview(file, content, {
            reason: entry.invalidReason,
            sourceRoom: room,
            exact,
            receiptDate: preReceiptCheck.receiptDate,
            receiptAmount: preReceiptCheck.receiptAmount
          }, read, modify, ocrConfig, logger);
          throw new FileUploadNotAllowedException(entry.invalidReason);
        }
        const identityMatch = findReceiptIdentityDuplicate(index, preReceiptCheck.receiptIdentity, reusableEntry);
        const receiptVisualMatch = findReceiptVisualDuplicate(index, visual, preReceiptCheck, reusableEntry);
        if (identityMatch || receiptVisualMatch) {
          const entry = reusableEntry || {};
          entry.exact = exact;
          entry.visual = visual;
          entry.receiptIdentity = preReceiptCheck.receiptIdentity;
          entry.receiptDate = preReceiptCheck.receiptDate;
          entry.receiptAmount = preReceiptCheck.receiptAmount;
          entry.source = "duplicate";
          entry.invalidReason = "🚫 ПОВТОР ЧЕКА";
          entry.validationVersion = 10;
          entry.uploadedAt = reusableEntry ? Number(entry.uploadedAt || now) : now;
          entry.uploadAttemptKey = attemptKey || entry.uploadAttemptKey || "";
          entry.userId = file.userId || "";
          entry.username = fileUser && fileUser.username || entry.username || "";
          entry.userName = fileUser && fileUser.name || entry.userName || "";
          entry.roomId = room.id;
          if (!reusableEntry) index.photos.push(entry);
          await writeIndex(persistence, protectedRoom.index, index);
          throw new FileUploadNotAllowedException("🚫 ПОВТОР ЧЕКА");
        }
      }
      const entry = reusableEntry || {};
      entry.exact = exact;
      entry.visual = visual;
      entry.validationVersion = protectedRoom.kind === "receipt" ? 10 : entry.validationVersion;
      entry.source = "pre";
      if (preReceiptCheck) {
        entry.receiptIdentity = preReceiptCheck.receiptIdentity;
        entry.receiptDate = preReceiptCheck.receiptDate;
        entry.receiptAmount = preReceiptCheck.receiptAmount;
        entry.receiptWarning = preReceiptCheck.receiptWarning || "";
        entry.invalidReason = "";
      }
      entry.uploadedAt = reusableEntry ? Number(entry.uploadedAt || now) : now;
      entry.uploadAttemptKey = attemptKey || entry.uploadAttemptKey || "";
      entry.userId = file.userId || "";
      entry.username = fileUser && fileUser.username || entry.username || "";
      entry.userName = fileUser && fileUser.name || entry.userName || "";
      entry.roomId = room.id;
      entry.sourceRoomIsDirect = isPersonalTarsRoom(room);
      if (entry.sourceRoomIsDirect) entry.expiresAt = now + 24 * 60 * 60 * 1e3;
      if (!reusableEntry) index.photos.push(entry);
      await writeIndex(persistence, protectedRoom.index, index);
    }
    function preUploadEntryMatchesMessage(entry, messageFileId, message, now = Date.now()) {
      if (!entry || entry.source !== "pre") return false;
      const uploadId = String(messageFileId || "");
      if (!uploadId) return false;
      const uploadMatches = String(entry.uploadAttemptKey || "") === uploadId || String(entry.uploadId || "") === uploadId;
      if (!uploadMatches) return false;
      const userId = String(message && message.sender && message.sender.id || "");
      const roomId = String(message && message.room && message.room.id || "");
      if (!userId || !roomId) return false;
      if (String(entry.userId || "") !== userId || String(entry.roomId || "") !== roomId) return false;
      const uploadedAt = Number(entry.uploadedAt || 0);
      const ttlMs = 30 * 60 * 1e3;
      return uploadedAt > 0 && uploadedAt >= now - ttlMs && uploadedAt <= now + 60 * 1e3;
    }
    function preUploadEntryMatchesPostedContent(entry, exact, message, now = Date.now()) {
      if (!entry || entry.source !== "pre") return false;
      const postedExact = String(exact || "");
      if (!postedExact || String(entry.exact || "") !== postedExact) return false;
      const userId = String(message && message.sender && message.sender.id || "");
      const roomId = String(message && message.room && message.room.id || "");
      if (!userId || !roomId) return false;
      if (String(entry.userId || "") !== userId || String(entry.roomId || "") !== roomId) return false;
      const uploadedAt = Number(entry.uploadedAt || 0);
      const ttlMs = 30 * 60 * 1e3;
      return uploadedAt > 0 && uploadedAt >= now - ttlMs && uploadedAt <= now + 60 * 1e3;
    }
    async function rejectDuplicateMessage(message, read, persistence, modify, logger, http, ocrConfig) {
      if (await isKnownArchiveRoom(message && message.room, read)) return false;
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (isTarsAppMessage(message, appUser)) return false;
      let protectedRoom = protectedRoomForMessage(message);
      const intent = directFileIntent(message);
      if (intent === "mailing") return false;
      const seenFileIds = {};
      const imageFiles = messageImageFiles(message);
      const personalRoom = isPersonalTarsRoom(message && message.room);
      // Run the workday cleanup for ANY message in a personal master room,
      // not only ones carrying a photo/receipt, so a text-only message (or
      // a "quiet" room with no photo activity that day) still triggers it.
      if (personalRoom) await cleanupExpiredMasterRoom(message.room, message.sender, read, modify, ocrConfig, logger);
      if (logger) logger.info(`FILE_PROBE message=${String(message && message.id || "none")} file=${String(message && message.file && (message.file._id || message.file.id) || "none")} files=${Array.isArray(message && message.files) ? message.files.map((file) => String(file && (file._id || file.id) || "none")).join(",") : "none"} images=${imageFiles.length}`);
      if (!imageFiles.length) return false;
      const fallbackProtectedRoom = protectedRoom;
      const indexCache = {};
      const roomCache = {};
      const acceptedByIndex = {};
      const getScopedIndex = async (roomConfig) => {
        if (!roomConfig || !roomConfig.index) return void 0;
        if (!indexCache[roomConfig.index]) {
          const loadedIndex = await readIndex(read, roomConfig.index);
          // Keep the short-lived local reservation written by guardUpload. OCR
          // either confirms it or turns it into a durable rejected-photo lock.
          // This prevents the same rejected image from being uploaded repeatedly.
          if (roomConfig.kind === "receipt") {
            const preCutoff = Date.now() - 30 * 60 * 1e3;
            loadedIndex.photos = loadedIndex.photos.filter((entry) => entry && (entry.source !== "pre" || Number(entry.uploadedAt || 0) >= preCutoff));
          }
          indexCache[roomConfig.index] = loadedIndex;
          roomCache[roomConfig.index] = roomConfig;
        }
        return indexCache[roomConfig.index];
      };
      const rememberAccepted = (roomConfig, entry) => {
        if (!roomConfig || !entry) return;
        entry.protectedIndex = roomConfig.index;
        entry.protectedKind = roomConfig.kind;
        if (!acceptedByIndex[roomConfig.index]) acceptedByIndex[roomConfig.index] = [];
        if (acceptedByIndex[roomConfig.index].indexOf(entry) === -1) acceptedByIndex[roomConfig.index].push(entry);
      };
      const acceptedEntries = [];
      let duplicate = false;
      let rejectionText = "";
      for (const messageFile of imageFiles) {
        try {
          const messageFileId = String(messageFile._id || messageFile.id || "");
          if (!messageFileId || seenFileIds[messageFileId]) continue;
          seenFileIds[messageFileId] = true;
          const content = await read.getUploadReader().getBufferById(messageFileId);
          if (personalRoom && await rememberOrDeletePostedPersonalImageDuplicate(message, messageFile, content, read, persistence, modify, logger)) return true;
          const postedExact = exactHash(content);
          let preclassifiedRoom;
          if (personalRoom && intent !== "mailing") {
            for (const candidateRoom of [PROTECTED_ROOMS.kassa, PROTECTED_ROOMS.otchet]) {
              const candidateIndex = await getScopedIndex(candidateRoom);
              const preEntry = candidateIndex && candidateIndex.photos.find((entry) => preUploadEntryMatchesMessage(entry, messageFileId, message) || preUploadEntryMatchesPostedContent(entry, postedExact, message));
              if (preEntry) {
                preclassifiedRoom = candidateRoom;
                if (logger) logger.info(`Reused scoped pre-upload ${candidateRoom.kind} classification for upload ${messageFileId}`);
                break;
              }
            }
          }
          protectedRoom = preclassifiedRoom || await protectedRoomForPersonalFile(message, messageFile, content, intent, fallbackProtectedRoom, http, ocrConfig, logger);
          if (!protectedRoom) continue;
          const index = await getScopedIndex(protectedRoom);
          if (!index) continue;
          if (message.id && index.photos.some((entry) => entry && entry.messageId === message.id && entry.uploadId === messageFileId && entry.postProcessedAt)) {
            if (logger) logger.info(`Skipped already processed ${protectedRoom.kind} upload ${messageFileId} in message ${message.id}`);
            continue;
          }
          const exact = exactHash(content);
          const visual = visualHash(messageFile, content);
          const exactMatch = findExactDuplicate(index, exact);
          const isSameConfirmedMessage = exactMatch && exactMatch.messageId && message.id && exactMatch.messageId === message.id;
          const isSameConfirmedUpload = exactMatch && exactMatch.uploadId && messageFileId && String(exactMatch.uploadId) === String(messageFileId) && exactMatch.source !== "duplicate" && exactMatch.source !== "rejected";
          if (isSameConfirmedMessage || isSameConfirmedUpload) {
            if (!exactMatch.messageId && message.id) exactMatch.messageId = message.id;
            if (!exactMatch.uploadId && messageFileId) exactMatch.uploadId = messageFileId;
            exactMatch.roomId = message.room && message.room.id || exactMatch.roomId || "";
            exactMatch.userId = message.sender && message.sender.id || exactMatch.userId || "";
            exactMatch.username = message.sender && message.sender.username || exactMatch.username || "";
            exactMatch.userName = message.sender && message.sender.name || exactMatch.userName || "";
            exactMatch.sourceRoomIsDirect = isPersonalTarsRoom(message.room);
            exactMatch.postProcessedAt = Date.now();
            if (protectedRoom.kind === "photo" && exactMatch.sourceRoomIsDirect && !exactMatch.reportMessageId) {
              exactMatch.reportQueuedAt = Date.now();
            }
            acceptedEntries.push(exactMatch);
            rememberAccepted(protectedRoom, exactMatch);
            continue;
          }
          if (protectedRoom.kind === "receipt" && exactMatch && exactMatch.source !== "pre") {
            if (exactMatch.source === "rejected") {
              const reason = receiptRejectionMessage(exactMatch.invalidReason || "receipt validation failed");
              if (message.id && message.sender) {
                await publishRejectedReceiptReview(messageFile, content, {
                  reason,
                  sourceRoom: message.room,
                  user: message.sender,
                  exact,
                  receiptDate: exactMatch.receiptDate,
                  receiptAmount: exactMatch.receiptAmount
                }, read, modify, ocrConfig, logger);
                await deleteReceiptMessage(message, read, modify, logger);
                await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, reason);
              }
              if (logger) logger.info(`Deleted posted rejected receipt ${message.id || "unknown"} with original reason`);
              return true;
            }
            // The receipt index is shared by all master rooms. Once an exact
            // fingerprint is confirmed, the same bytes are always a duplicate,
            // even when Rocket.Chat posts them in another personal room.
            if (exactMatch.source === "archive_failed" && exactMatch.receiptDate && amountFromEntry(exactMatch) !== void 0 && (!exactMatch.archiveKey || exactMatch.archiveStatus !== "stored" || !await archiveUploadExists(exactMatch, read))) {
              try {
                const archived = await archiveReceipt(
                  { ...messageFile, userId: message.sender && message.sender.id || exactMatch.userId || "" },
                  content,
                  {
                    receiptDate: exactMatch.receiptDate,
                    receiptAmount: exactMatch.receiptAmount,
                    receiptIdentity: exactMatch.receiptIdentity
                  },
                  exact,
                  read,
                  persistence,
                  modify,
                  ocrConfig,
                  logger
                );
                if (!archived || archived.archiveStatus !== "stored" || !archived.archiveKey) throw new Error("Rocket.Chat receipt archive did not confirm storage");
                Object.assign(exactMatch, archived);
                exactMatch.source = "confirmed";
                exactMatch.invalidReason = "";
                exactMatch.postProcessedAt = Date.now();
                await writeIndex(persistence, protectedRoom.index, index);
                if (logger) logger.info(`Recovered archive for previously failed receipt ${String(exact || "").slice(0, 16)} from duplicate upload`);
              } catch (archiveError) {
                exactMatch.archiveStatus = "failed";
                exactMatch.archiveError = String(archiveError && archiveError.message || archiveError).slice(0, 500);
                exactMatch.postProcessedAt = Date.now();
                await writeIndex(persistence, protectedRoom.index, index);
                if (logger) logger.error(`Could not recover archive for duplicate receipt ${message.id || "unknown"}: ${archiveError && archiveError.message || archiveError}`);
              }
            }
            if (message.id && message.sender) {
              await deleteReceiptMessage(message, read, modify, logger);
              await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, "🚫 ПОВТОР ЧЕКА");
            }
            if (logger) logger.info(`Deleted posted exact duplicate receipt ${message.id || "unknown"}`);
            return true;
          }
          const isCurrentPreUpload = exactMatch && exactMatch.source === "pre" && exactMatch.roomId === (message.room && message.room.id || exactMatch.roomId) && (protectedRoom.kind === "receipt" || Date.now() - Number(exactMatch.uploadedAt || 0) < 30 * 60 * 1e3);
          if (isCurrentPreUpload) {
            if (protectedRoom.kind === "receipt") {
              const receiptCheck = exactMatch.receiptIdentity && exactMatch.receiptDate && amountFromEntry(exactMatch) !== void 0 && Number(exactMatch.validationVersion || 0) >= 10 ? {
                ok: true,
                receiptIdentity: exactMatch.receiptIdentity,
                receiptDate: exactMatch.receiptDate,
                receiptAmount: amountFromEntry(exactMatch),
                receiptWarning: exactMatch.receiptWarning || ""
              } : await validateReceiptStrict(messageFile, content, http, ocrConfig, logger);
              if (!receiptCheck.ok) {
                // Keep the exact photo fingerprint even when validation
                // fails. The rejected message is deleted before any archive
                // call, while every later upload of the same bytes is rejected
                // by guardUpload as a duplicate. A genuinely new or clearer
                // photograph has a different exact fingerprint and can still
                // be checked normally.
                exactMatch.visual = visual || exactMatch.visual;
                exactMatch.source = "rejected";
                exactMatch.receiptIdentity = receiptCheck.receiptIdentity || exactMatch.receiptIdentity || "";
                exactMatch.receiptDate = receiptCheck.receiptDate || exactMatch.receiptDate || "";
                exactMatch.receiptAmount = receiptCheck.receiptAmount !== void 0 ? receiptCheck.receiptAmount : exactMatch.receiptAmount;
                exactMatch.invalidReason = receiptRejectionMessage(receiptCheck.reason || "receipt validation failed");
                exactMatch.validationVersion = 11;
                exactMatch.roomId = message.room && message.room.id || exactMatch.roomId;
                exactMatch.userId = message.sender && message.sender.id || exactMatch.userId || "";
                exactMatch.username = message.sender && message.sender.username || exactMatch.username || "";
                exactMatch.userName = message.sender && message.sender.name || exactMatch.userName || "";
                exactMatch.messageId = message.id || exactMatch.messageId || "";
                exactMatch.uploadId = messageFileId;
                exactMatch.postProcessedAt = Date.now();
                await writeIndex(persistence, protectedRoom.index, index);
                if (message.id && message.sender) {
                  await deleteReceiptMessage(message, read, modify, logger);
                }
                await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, exactMatch.invalidReason);
                if (logger) logger.info(`Deleted unconfirmed receipt ${message.id || "unknown"}; exact photo fingerprint locked: ${exactMatch.invalidReason}`);
                return true;
              }
              const identityMatch = findReceiptIdentityDuplicate(index, receiptCheck.receiptIdentity, exactMatch);
              const receiptVisualMatch = findReceiptVisualDuplicate(index, visual, receiptCheck, exactMatch);
              if (identityMatch || receiptVisualMatch) {
                // The receipt identity (document/operation number) is the
                // authoritative duplicate key. Retain the new photograph
                // exact fingerprint too, so uploading these same bytes again
                // is blocked before OCR instead of repeating the full check.
                exactMatch.visual = visual || exactMatch.visual;
                exactMatch.receiptIdentity = receiptCheck.receiptIdentity;
                exactMatch.receiptDate = receiptCheck.receiptDate;
                exactMatch.receiptAmount = receiptCheck.receiptAmount;
                exactMatch.source = "duplicate";
                exactMatch.invalidReason = "🚫 ПОВТОР ЧЕКА";
                exactMatch.validationVersion = 10;
                exactMatch.messageId = message.id || exactMatch.messageId || "";
                exactMatch.uploadId = messageFileId;
                exactMatch.postProcessedAt = Date.now();
                await writeIndex(persistence, protectedRoom.index, index);
                await publishRejectedReceiptReview(messageFile, content, {
                  reason: exactMatch.invalidReason,
                  sourceRoom: message.room,
                  user: message.sender,
                  exact,
                  receiptDate: receiptCheck.receiptDate,
                  receiptAmount: receiptCheck.receiptAmount
                }, read, modify, ocrConfig, logger);
                if (message.id && message.sender) {
                  await deleteReceiptMessage(message, read, modify, logger);
                  await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, "\u{1F6AB} \u041F\u041E\u0412\u0422\u041E\u0420 \u0427\u0415\u041A\u0410");
                }
                if (logger) logger.info(`Deleted proven duplicate receipt message ${message.id || "unknown"}`);
                return true;
              }
              exactMatch.receiptIdentity = receiptCheck.receiptIdentity;
              exactMatch.receiptDate = receiptCheck.receiptDate;
              exactMatch.receiptAmount = receiptCheck.receiptAmount;
              exactMatch.receiptWarning = receiptCheck.receiptWarning || "";
              exactMatch.validationVersion = 10;
              exactMatch.invalidReason = "";
            }
            exactMatch.roomId = message.room && message.room.id || exactMatch.roomId;
            exactMatch.userId = message.sender && message.sender.id || exactMatch.userId || "";
            exactMatch.username = message.sender && message.sender.username || exactMatch.username || "";
            exactMatch.userName = message.sender && message.sender.name || exactMatch.userName || "";
            exactMatch.sourceRoomIsDirect = isPersonalTarsRoom(message.room);
            exactMatch.messageId = message.id || exactMatch.messageId || "";
            exactMatch.uploadId = messageFileId;
            if (exactMatch.sourceRoomIsDirect) exactMatch.expiresAt = Date.now() + 24 * 60 * 60 * 1e3;
            if (protectedRoom.kind === "photo" && exactMatch.sourceRoomIsDirect && !exactMatch.reportMessageId) {
              exactMatch.reportQueuedAt = Date.now();
            }
            if (protectedRoom.kind === "receipt" && !exactMatch.archiveKey) {
              markReceiptArchivePending(exactMatch, exactMatch.uploadedAt || Date.now());
            }
            exactMatch.source = "confirmed";
            exactMatch.postProcessedAt = Date.now();
            if (protectedRoom.kind === "receipt" && exactMatch.receiptWarning && !exactMatch.receiptWarningPublishedAt) {
              await publishRejectedReceiptReview(messageFile, content, {
                reason: exactMatch.receiptWarning,
                sourceRoom: message.room,
                user: message.sender,
                exact,
                receiptDate: exactMatch.receiptDate,
                receiptAmount: exactMatch.receiptAmount
              }, read, modify, ocrConfig, logger);
              exactMatch.receiptWarningPublishedAt = Date.now();
            }
            acceptedEntries.push(exactMatch);
            rememberAccepted(protectedRoom, exactMatch);
            continue;
          }
          if (exactMatch) {
            duplicate = true;
            if (protectedRoom.kind === "photo") rejectionText = "🚫 ПОВТОР ФОТО";
            break;
          }
          let receiptIdentity;
          let receiptDate;
          let receiptAmount;
          let receiptWarning = "";
          if (protectedRoom.kind === "receipt") {
            const receiptCheck = await validateReceiptStrict(messageFile, content, http, ocrConfig, logger);
            if (!receiptCheck.ok) {
              const rejectedEntry = {
                exact,
                visual,
                source: "rejected",
                receiptIdentity: receiptCheck.receiptIdentity || "",
                receiptDate: receiptCheck.receiptDate || "",
                receiptAmount: receiptCheck.receiptAmount,
                invalidReason: receiptRejectionMessage(receiptCheck.reason || "receipt validation failed"),
                validationVersion: 11,
                uploadedAt: Date.now(),
                userId: message.sender && message.sender.id || "",
                username: message.sender && message.sender.username || "",
                userName: message.sender && message.sender.name || "",
                roomId: message.room && message.room.id || "",
                messageId: message.id || "",
                uploadId: messageFileId,
                postProcessedAt: Date.now()
              };
              index.photos.push(rejectedEntry);
              await writeIndex(persistence, protectedRoom.index, index);
              await publishRejectedReceiptReview(messageFile, content, {
                reason: rejectedEntry.invalidReason,
                sourceRoom: message.room,
                user: message.sender,
                exact,
                receiptDate: receiptCheck.receiptDate,
                receiptAmount: receiptCheck.receiptAmount
              }, read, modify, ocrConfig, logger);
              if (message.id && message.sender) await deleteReceiptMessage(message, read, modify, logger);
              await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, rejectedEntry.invalidReason);
              if (logger) logger.info(`Deleted suspicious receipt ${message.id || "unknown"} without pre-upload reservation: ${rejectedEntry.invalidReason}`);
              return true;
            }
            const identityMatch = findReceiptIdentityDuplicate(index, receiptCheck.receiptIdentity);
            const receiptVisualMatch = findReceiptVisualDuplicate(index, visual, receiptCheck);
            if (identityMatch || receiptVisualMatch) {
              index.photos.push({
                exact,
                visual,
                receiptIdentity: receiptCheck.receiptIdentity,
                receiptDate: receiptCheck.receiptDate,
                receiptAmount: receiptCheck.receiptAmount,
                source: "duplicate",
                invalidReason: "🚫 ПОВТОР ЧЕКА",
                validationVersion: 10,
                uploadedAt: Date.now(),
                userId: message.sender && message.sender.id || "",
                username: message.sender && message.sender.username || "",
                userName: message.sender && message.sender.name || "",
                roomId: message.room && message.room.id || "",
                messageId: message.id || "",
                uploadId: messageFileId,
                postProcessedAt: Date.now()
              });
              await writeIndex(persistence, protectedRoom.index, index);
              if (message.id && message.sender) {
                await deleteReceiptMessage(message, read, modify, logger);
                await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, "🚫 ПОВТОР ЧЕКА");
              }
              if (logger) logger.info(`Deleted duplicate receipt ${message.id || "unknown"} without pre-upload reservation`);
              return true;
            }
            receiptIdentity = receiptCheck.receiptIdentity;
            receiptDate = receiptCheck.receiptDate;
            receiptAmount = receiptCheck.receiptAmount;
            receiptWarning = receiptCheck.receiptWarning || "";
          } else {
            const exactPhotoMatch = findExactDuplicate(index, exact);
            if (exactPhotoMatch) {
              const reportMessageId = String(exactPhotoMatch.reportMessageId || "");
              const staleReportStatus = reportMessageId === "duplicate" || reportMessageId === "blocked" || reportMessageId === "failed";
              const expiredPublishing = reportMessageId === "publishing" && Number(exactPhotoMatch.reportPublishLockUntil || 0) <= Date.now();
              const notPublishedToReport = !exactPhotoMatch.reportUploadId && (!reportMessageId || staleReportStatus || expiredPublishing);
              const sameUser = !exactPhotoMatch.userId || String(exactPhotoMatch.userId || "") === String(message.sender && message.sender.id || "");
              if (protectedRoom.kind === "photo" && isPersonalTarsRoom(message.room) && notPublishedToReport && (sameUser || exactPhotoMatch.sourceRoomIsDirect)) {
                const requeuedAt = Date.now();
                exactPhotoMatch.exact = exactPhotoMatch.exact || exact;
                exactPhotoMatch.visual = exactPhotoMatch.visual || visual;
                exactPhotoMatch.source = exactPhotoMatch.source === "duplicate" || exactPhotoMatch.source === "rejected" ? "post" : exactPhotoMatch.source || "post";
                exactPhotoMatch.uploadedAt = Number(exactPhotoMatch.uploadedAt || requeuedAt);
                exactPhotoMatch.userId = message.sender && message.sender.id || exactPhotoMatch.userId || "";
                exactPhotoMatch.username = message.sender && message.sender.username || exactPhotoMatch.username || "";
                exactPhotoMatch.userName = message.sender && message.sender.name || exactPhotoMatch.userName || "";
                exactPhotoMatch.roomId = message.room && message.room.id || exactPhotoMatch.roomId || "";
                exactPhotoMatch.sourceRoomIsDirect = true;
                exactPhotoMatch.expiresAt = requeuedAt + 24 * 60 * 60 * 1e3;
                exactPhotoMatch.messageId = message.id || exactPhotoMatch.messageId || "";
                exactPhotoMatch.uploadId = messageFileId || exactPhotoMatch.uploadId || "";
                exactPhotoMatch.reportQueuedAt = requeuedAt;
                exactPhotoMatch.postProcessedAt = requeuedAt;
                delete exactPhotoMatch.reportMessageId;
                delete exactPhotoMatch.reportPublishedAt;
                delete exactPhotoMatch.reportPublishLockUntil;
                acceptedEntries.push(exactPhotoMatch);
                rememberAccepted(protectedRoom, exactPhotoMatch);
                continue;
              }
              duplicate = true;
              rejectionText = "🚫 ПОВТОР ФОТО";
              break;
            }
          }
          const acceptedAt = Date.now();
          const acceptedEntry = {
            exact,
            visual,
            receiptIdentity,
            receiptDate,
            receiptAmount,
            receiptWarning,
            validationVersion: protectedRoom.kind === "receipt" ? 10 : void 0,
            source: protectedRoom.kind === "receipt" ? "confirmed" : "post",
            uploadedAt: acceptedAt,
            userId: message.sender && message.sender.id || "",
            username: message.sender && message.sender.username || "",
            userName: message.sender && message.sender.name || "",
            roomId: message.room && message.room.id || "",
            sourceRoomIsDirect: isPersonalTarsRoom(message.room),
            expiresAt: isPersonalTarsRoom(message.room) ? acceptedAt + 24 * 60 * 60 * 1e3 : void 0,
            messageId: message.id || "",
            uploadId: messageFileId,
            reportQueuedAt: protectedRoom.kind === "photo" && isPersonalTarsRoom(message.room) ? acceptedAt : void 0,
            postProcessedAt: Date.now()
          };
          if (protectedRoom.kind === "receipt" && receiptWarning) {
            await publishRejectedReceiptReview(messageFile, content, {
              reason: receiptWarning,
              sourceRoom: message.room,
              user: message.sender,
              exact,
              receiptDate,
              receiptAmount
            }, read, modify, ocrConfig, logger);
            acceptedEntry.receiptWarningPublishedAt = Date.now();
          }
          if (protectedRoom.kind === "receipt") markReceiptArchivePending(acceptedEntry, acceptedAt);
          index.photos.push(acceptedEntry);
          acceptedEntries.push(acceptedEntry);
          rememberAccepted(protectedRoom, acceptedEntry);
        } catch (postError) {
          if (logger) logger.warn(`Duplicate post-check failed for upload ${messageFile._id || messageFile.id || "unknown"}: ${postError && postError.message || postError}`);
        }
      }
      if (!duplicate) {
        for (const indexName of Object.keys(indexCache)) {
          const roomConfig = roomCache[indexName];
          const scopedIndex = indexCache[indexName];
          const scopedEntries = acceptedByIndex[indexName] || [];
          if (!roomConfig || !scopedIndex) continue;
          if (roomConfig.kind === "receipt" && isPersonalTarsRoom(message.room)) {
            for (const entry of scopedEntries) {
              try {
                await publishAcceptedReceipt(entry, message, read, modify, ocrConfig, logger);
              } catch (error) {
                if (logger) logger.warn(`Could not publish accepted receipt: ${error && error.message || error}`);
              }
            }
          }
          if (roomConfig.kind === "photo" && isPersonalTarsRoom(message.room)) {
            try {
              await publishDirectReportPhotos(message, read, persistence, modify, logger, scopedEntries, scopedIndex, indexName, http, ocrConfig);
            } catch (error) {
              if (logger) logger.warn(`Could not publish personal report photo immediately: ${error && error.message || error}`);
            }
          }
          await writeIndex(persistence, indexName, scopedIndex);
        }
        const receiptEntries = Object.keys(acceptedByIndex).reduce((list, indexName) => {
          const roomConfig = roomCache[indexName];
          return roomConfig && roomConfig.kind === "receipt" ? list.concat(acceptedByIndex[indexName] || []) : list;
        }, []);
        if (receiptEntries.length) {
          const refreshed = {};
          for (const entry of receiptEntries) {
            const userId = String(entry && entry.userId || message.sender && message.sender.id || "");
            const targetDate = String(entry && entry.receiptDate || expectedReceiptDate(ocrConfig));
            const key = `${userId}:${targetDate}`;
            if (!userId || refreshed[key]) continue;
            refreshed[key] = true;
            try {
              await publishMasterTransferSummary(entry, message, read, persistence, modify, ocrConfig, logger);
            } catch (error) {
              if (logger) logger.warn(`Could not refresh master transfer summary: ${error && error.message || error}`);
            }
          }
        }
        return false;
      }
      if (protectedRoom.kind === "receipt") {
        if (!message.id || !message.sender) return false;
        await deleteReceiptMessage(message, read, modify, logger);
        await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, rejectionText || "🚫 ПОВТОР ЧЕКА");
        if (logger) logger.info(`Deleted receipt message ${message.id || "unknown"} after post-check rejection`);
        return true;
      }
      if (!message.id || !message.sender) return false;
      await modify.getDeleter().deleteMessage(message, message.sender);
      await notifyDuplicateUser(message.sender, message.room, protectedRoom, read, modify, logger, rejectionText);
      if (logger) logger.info(`Deleted duplicate ${protectedRoom.kind} message from user ${message.sender.id || "unknown"}`);
      return true;
    }
    function isTodayTransferSumRequest(message) {
      const slug = String(message.room && message.room.slugifiedName || "").toLowerCase();
      const protectedRoom = protectedRoomForSlug(slug);
      if (!protectedRoom || protectedRoom.kind !== "receipt") return false;
      const text = String(message.text || "").toLowerCase().replace(/ё/g, "е");
      return text.indexOf("сумм") !== -1 && text.indexOf("перевод") !== -1 && (text.indexOf("сегодня") !== -1 || text.indexOf("за день") !== -1);
    }
    function amountFromEntry(entry) {
      const direct = Number(entry && entry.receiptAmount);
      if (Number.isFinite(direct) && direct > 0) return direct;
      const identity = String(entry && entry.receiptIdentity || "");
      if (identity.indexOf("txn:") === 0) {
        const parts = identity.slice(4).split("|");
        const legacy = Number(parts[2]);
        if (Number.isFinite(legacy) && legacy > 0) return legacy;
      }
      return void 0;
    }
    function dateFromEntry(entry, config) {
      if (entry && entry.receiptDate) return String(entry.receiptDate);
      const identity = String(entry && entry.receiptIdentity || "");
      if (identity.indexOf("txn:") === 0) return identity.slice(4).split("|")[0] || "";
      return receiptCalendarDateForTimestamp(entry && entry.uploadedAt, config);
    }
    async function confirmedTransferSummaryForUser(read, config, userId, targetDate, nameCandidates, currentValidatedReceipt) {
      const index = await readIndex(read, PROTECTED_ROOMS.kassa.index);
      const workday = targetDate || expectedReceiptDate(config);
      const candidates = Array.isArray(nameCandidates) ? nameCandidates : [];
      const seen = {};
      let count = 0;
      let total = 0;
      let missing = 0;
      for (const entry of index.photos) {
        if (!entry || entry.source === "pre" || entry.source === "invalid" || entry.source === "rejected" || entry.source === "archive_failed" || entry.source === "duplicate") continue;
        if (userId && entry.userId !== userId) continue;
        if (!userId && candidates.length && !transferEntryMatchesCandidates(entry, candidates)) continue;
        if (dateFromEntry(entry, config) !== workday) continue;
        const key = normalizedReceiptIdentityKey(entry.receiptIdentity) || String(entry.exact || "");
        if (key && seen[key]) continue;
        if (key) seen[key] = true;
        const amount = amountFromEntry(entry);
        if (amount === void 0) {
          missing += 1;
          continue;
        }
        count += 1;
        total += amount;
      }
      if (currentValidatedReceipt && currentValidatedReceipt.source === "pre") {
        const currentMatchesUser = userId ? currentValidatedReceipt.userId === userId : !candidates.length || transferEntryMatchesCandidates(currentValidatedReceipt, candidates);
        const currentKey = normalizedReceiptIdentityKey(currentValidatedReceipt.receiptIdentity) || String(currentValidatedReceipt.exact || "");
        if (currentMatchesUser && dateFromEntry(currentValidatedReceipt, config) === workday && (!currentKey || !seen[currentKey])) {
          const currentAmount = amountFromEntry(currentValidatedReceipt);
          if (currentAmount === void 0) missing += 1;
          else {
            count += 1;
            total += currentAmount;
          }
        }
      }
      return { count, total: Math.round(total * 100) / 100, missing };
    }
    function masterTransferSummaryAssociation(userId, targetDate) {
      return new RocketChatAssociationRecord(
        RocketChatAssociationModel.MISC,
        `receipt-transfer-summary:${targetDate}:${userId}`
      );
    }
    async function publishMasterTransferSummary(entry, message, read, persistence, modify, config, logger, includeCurrentValidatedReceipt = false) {
      const userId = String(entry && entry.userId || "");
      const nameCandidates = entry && Array.isArray(entry.nameCandidates) ? entry.nameCandidates : [];
      const associationKey = userId || "name:" + transferNameKey(entry && (entry.username || entry.userName || nameCandidates[0]) || "");
      if (!associationKey || associationKey === "name:") return false;
      const targetDate = String(entry && entry.receiptDate || expectedReceiptDate(config));
      const room = message && isPersonalTarsRoom(message.room) ? message.room : await findResultRoom(read, config);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) return false;
      const summary = await confirmedTransferSummaryForUser(read, config, userId, targetDate, nameCandidates, includeCurrentValidatedReceipt ? entry : void 0);
      const association = masterTransferSummaryAssociation(associationKey, targetDate);
      const previous = await read.getPersistenceReader().readByAssociation(association);
      for (const record of previous || []) {
        if (!record || !record.messageId) continue;
        try {
          const previousBuilder = await modify.getUpdater().message(record.messageId, appUser);
          const previousMessage = previousBuilder.getMessage();
          if (previousMessage) await modify.getDeleter().deleteMessage(previousMessage, previousMessage.sender || appUser);
        } catch (error) {
          if (logger) logger.warn(`Could not delete previous transfer summary ${record.messageId}: ${error && error.message || error}`);
        }
      }
      await persistence.removeByAssociation(association);
      const amountText = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(summary.total);
      const username = entry && entry.username ? `@${entry.username}` : entry && entry.userName ? entry.userName : message && message.sender && message.sender.username ? `@${message.sender.username}` : message && message.sender && (message.sender.name || message.sender.id) || "мастер";
      let text = `🧾 ИТОГО ПО ЧЕКАМ\nМастер: ${username}\nДата: ${displayDate(targetDate)}\nЧеков: ${summary.count}\nОбщая сумма чеков: ${amountText} ₽`;
      if (summary.missing) text += `\nНе учтено чеков без суммы: ${summary.missing}`;
      const builder = modify.getCreator().startMessage().setSender(appUser).setRoom(room).setText(text);
      const messageId = await modify.getCreator().finish(builder);
      await persistence.createWithAssociation({
        userId,
        targetDate,
        roomId: room.id,
        messageId: messageId || "",
        count: summary.count,
        total: summary.total,
        updatedAt: Date.now()
      }, association);
      return true;
    }
    function latinizeUsername(value) {
      const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
        к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
        х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
      };
      return String(value || "").toLowerCase().replace(/[а-яё]/g, (char) => map[char] || char);
    }
    function transferNameVariants(value) {
      const clean = String(value || "").trim().replace(/^@/, "").replace(/[^a-zа-я0-9._-]+/gi, "").replace(/^[._-]+|[._-]+$/g, "").toLowerCase().replace(/ё/g, "е");
      if (!clean || clean.length < 3) return [];
      const variants = [clean];
      const compact = clean.replace(/[._-]+/g, "");
      if (compact && compact !== clean) variants.push(compact);
      if (clean.indexOf(".") !== -1) variants.push(clean.replace(/\./g, "_"), clean.replace(/\./g, "-"));
      if (clean.indexOf("_") !== -1) variants.push(clean.replace(/_/g, "."), clean.replace(/_/g, "-"));
      if (clean.indexOf("-") !== -1) variants.push(clean.replace(/-/g, "."), clean.replace(/-/g, "_"));
      if (/а$/i.test(clean) && clean.length > 4) variants.push(clean.slice(0, -1));
      const latin = latinizeUsername(clean);
      if (latin && latin !== clean) variants.push(latin);
      const base = /а$/i.test(clean) && clean.length > 4 ? clean.slice(0, -1) : "";
      if (base) {
        const latinBase = latinizeUsername(base);
        if (latinBase && latinBase !== base) variants.push(latinBase);
      }
      return variants.filter((name, index) => name && variants.indexOf(name) === index);
    }
    function transferNameKey(value) {
      return latinizeUsername(String(value || "").trim().replace(/^@/, "").replace(/[^a-zа-я0-9._ -]+/gi, "").replace(/ё/g, "е")).replace(/[._\-\s]+/g, "").toLowerCase();
    }
    function transferEntryMatchesCandidates(entry, candidates) {
      const keys = (candidates || []).map(transferNameKey).filter(Boolean);
      if (!keys.length) return false;
      const values = [entry && entry.username, entry && entry.userName, entry && entry.userId];
      for (const value of values) {
        if (!value) continue;
        const variants = transferNameVariants(value);
        for (const variant of variants) {
          if (keys.indexOf(transferNameKey(variant)) !== -1) return true;
        }
      }
      return false;
    }
    function transferSummaryCandidateNames(message) {
      const source = String(message && message.text || "").toLowerCase().replace(/ё/g, "е");
      const stop = {
        сумма: true, сумм: true, переводы: true, переводов: true, перевод: true, сегодня: true, день: true, дня: true,
        за: true, по: true, посчитай: true, посчитать: true, пересчитай: true, пересчитать: true, мастер: true,
        мастера: true, чек: true, чеков: true, чеки: true, тарс: true, пожалуйста: true
      };
      const names = [];
      const add = (value) => {
        const variants = transferNameVariants(value);
        for (const clean of variants) {
          if (!clean || stop[clean] || clean.length < 3) continue;
          names.push(clean);
        }
      };
      let match;
      const mentions = /@([a-zа-я0-9._-]+)/gi;
      while ((match = mentions.exec(source))) add(match[1]);
      for (const word of source.split(/\s+/)) add(word);
      return names.filter((name, index) => names.indexOf(name) === index);
    }
    function isMasterTransferSumRequest(message) {
      const slug = String(message && message.room && message.room.slugifiedName || "").toLowerCase();
      const protectedRoom = protectedRoomForSlug(slug);
      if (!protectedRoom || protectedRoom.kind !== "receipt") return false;
      const text = String(message.text || "").toLowerCase().replace(/ё/g, "е");
      return text.indexOf("сумм") !== -1 && text.indexOf("перевод") !== -1 && transferSummaryCandidateNames(message).length > 0;
    }
    async function resolveTransferSummaryUser(message, read, config) {
      const candidates = transferSummaryCandidateNames(message);
      for (const username of candidates) {
        try {
          const user = await read.getUserReader().getByUsername(username);
          if (user) return user;
        } catch (_7) {
        }
      }
      const matchesCandidate = (value) => {
        const variants = transferNameVariants(value);
        const keys = candidates.map(transferNameKey);
        return variants.some((variant) => candidates.indexOf(variant) !== -1 || keys.indexOf(transferNameKey(variant)) !== -1);
      };
      if (message && message.room) {
        const seen = {};
        let skip = 0;
        try {
          while (skip < 500) {
            const messages = await read.getRoomReader().getMessages(message.room.id, {
              limit: 100,
              skip,
              sort: { createdAt: "desc" },
              showThreadMessages: true
            });
            if (!messages || !messages.length) break;
            for (const roomMessage of messages) {
              const sender = roomMessage && roomMessage.sender;
              if (!sender || !sender.id || seen[sender.id]) continue;
              seen[sender.id] = true;
              if (matchesCandidate(sender.username) || matchesCandidate(sender.name)) return sender;
            }
            skip += messages.length;
            if (messages.length < 100) break;
          }
        } catch (_8) {
        }
      }
      try {
        const index = await readIndex(read, PROTECTED_ROOMS.kassa.index);
        const targetDate = expectedReceiptDate(config || {});
        for (const entry of index.photos || []) {
          if (!entry || !entry.userId || dateFromEntry(entry, config || {}) !== targetDate) continue;
          if (matchesCandidate(entry.username) || matchesCandidate(entry.userName) || matchesCandidate(entry.userId)) {
            return { id: entry.userId, username: entry.username || "", name: entry.userName || "" };
          }
        }
      } catch (_9) {
      }
      return void 0;
    }
    async function sendMasterTransferSummaryRequest(message, read, persistence, modify, logger, http, config) {
      const targetDate = expectedReceiptDate(config);
      await repairTodayReceiptIndex(message, read, persistence, modify, http, config, logger);
      const candidates = transferSummaryCandidateNames(message);
      const user = await resolveTransferSummaryUser(message, read, config);
      await publishMasterTransferSummary({
        userId: user && user.id || "",
        receiptDate: targetDate,
        username: user && user.username || candidates[0] || "",
        userName: user && user.name || "",
        nameCandidates: candidates
      }, message, read, persistence, modify, config, logger);
      return true;
    }
    async function repairTodayReceiptIndex(message, read, persistence, modify, http, config, logger) {
      const index = await readIndex(read, PROTECTED_ROOMS.kassa.index);
      if (!message.room) return index;
      const targetDate = expectedReceiptDate(config);
      const seenFileIds = {};
      let skip = 0;
      let changed = false;
      let reachedOlderDay = false;
      while (skip < 500 && !reachedOlderDay) {
        const messages = await read.getRoomReader().getMessages(message.room.id, {
          limit: 100,
          skip,
          sort: { createdAt: "desc" },
          showThreadMessages: true
        });
        if (!messages || !messages.length) break;
        for (const roomMessage of messages) {
          const createdAt = roomMessage.createdAt ? new Date(roomMessage.createdAt).getTime() : Date.now();
          const messageDate = receiptCalendarDateForTimestamp(createdAt, config);
          if (messageDate < targetDate) {
            reachedOlderDay = true;
            break;
          }
          if (messageDate !== targetDate) continue;
          const files = [];
          if (roomMessage.file) files.push(roomMessage.file);
          if (Array.isArray(roomMessage.files)) files.push(...roomMessage.files);
          for (const messageFile of files) {
            const messageFileId = String(messageFile && (messageFile._id || messageFile.id) || "");
            if (!messageFile || !messageFileId || seenFileIds[messageFileId]) continue;
            seenFileIds[messageFileId] = true;
            try {
              const upload = await read.getUploadReader().getById(messageFileId);
              const file = {
                name: messageFile.name || upload && upload.name || "receipt.jpg",
                type: messageFile.type || upload && upload.type || "image/jpeg"
              };
              if (!isImage(file)) continue;
              const content = await read.getUploadReader().getBufferById(messageFileId);
              const exact = exactHash(content);
              let entry = findExactDuplicate(index, exact);
              if (entry && entry.validationVersion >= 2 && entry.source !== "invalid" && entry.source !== "rejected" && entry.source !== "archive_failed" && entry.source !== "duplicate" && entry.receiptDate === targetDate && amountFromEntry(entry) !== void 0) {
                const senderId = roomMessage.sender && roomMessage.sender.id || "";
                const senderUsername = roomMessage.sender && roomMessage.sender.username || "";
                const senderName = roomMessage.sender && roomMessage.sender.name || "";
                if (senderUsername && !entry.username) {
                  entry.username = senderUsername;
                  changed = true;
                }
                if (senderName && !entry.userName) {
                  entry.userName = senderName;
                  changed = true;
                }
                if (roomMessage.id && !entry.messageId) {
                  entry.messageId = roomMessage.id;
                  changed = true;
                }
                if (messageFileId && !entry.uploadId) {
                  entry.uploadId = messageFileId;
                  changed = true;
                }
                if (entry.source === "pre" || entry.roomId !== message.room.id || senderId && !entry.userId) {
                  entry.source = "confirmed";
                  entry.roomId = message.room.id;
                  if (senderId && !entry.userId) entry.userId = senderId;
                  entry.username = roomMessage.sender && roomMessage.sender.username || entry.username || "";
                  entry.userName = roomMessage.sender && roomMessage.sender.name || entry.userName || "";
                  changed = true;
                }
                if (!entry.archiveKey || entry.archiveStatus !== "stored" || !await archiveUploadExists(entry, read)) {
                  entry.archiveKey = "";
                  entry.archiveUploadId = "";
                  entry.archiveMessageId = "";
                  markReceiptArchivePending(entry, entry.uploadedAt || createdAt);
                  entry.source = "confirmed";
                  entry.invalidReason = "";
                  changed = true;
                }
                continue;
              }
              const receiptCheck = await validateReceiptDate(file, content, http, config, logger);
              if (!receiptCheck.ok) {
                if (entry) {
                  entry.source = "rejected";
                  entry.invalidReason = receiptCheck.reason;
                  entry.validationVersion = 2;
                  entry.roomId = message.room.id;
                  entry.userId = roomMessage.sender && roomMessage.sender.id || entry.userId || "";
                  entry.username = roomMessage.sender && roomMessage.sender.username || entry.username || "";
                  entry.userName = roomMessage.sender && roomMessage.sender.name || entry.userName || "";
                  entry.messageId = roomMessage.id || entry.messageId || "";
                  entry.uploadId = messageFileId || entry.uploadId || "";
                  changed = true;
                }
                continue;
              }
              if (!entry) {
                entry = { exact };
                index.photos.push(entry);
              }
              entry.exact = exact;
              entry.visual = entry.visual || visualHash(file, content);
              entry.receiptIdentity = receiptCheck.receiptIdentity;
              entry.receiptDate = receiptCheck.receiptDate;
              entry.receiptAmount = receiptCheck.receiptAmount;
              entry.receiptWarning = receiptCheck.receiptWarning || "";
              entry.validationVersion = 2;
              entry.invalidReason = "";
              entry.source = "confirmed";
              entry.uploadedAt = createdAt;
              entry.userId = roomMessage.sender && roomMessage.sender.id || entry.userId || "";
              entry.username = roomMessage.sender && roomMessage.sender.username || entry.username || "";
              entry.userName = roomMessage.sender && roomMessage.sender.name || entry.userName || "";
              entry.roomId = message.room.id;
              entry.messageId = roomMessage.id || entry.messageId || "";
              entry.uploadId = messageFileId || entry.uploadId || "";
              if (entry.receiptWarning && !entry.receiptWarningPublishedAt) {
                await publishRejectedReceiptReview(file, content, {
                  reason: entry.receiptWarning,
                  sourceRoom: message.room,
                  user: roomMessage.sender,
                  exact,
                  receiptDate: entry.receiptDate,
                  receiptAmount: entry.receiptAmount
                }, read, modify, config, logger);
                entry.receiptWarningPublishedAt = Date.now();
              }
              markReceiptArchivePending(entry, createdAt);
              changed = true;
            } catch (error) {
              if (logger) logger.warn(`Summary repair could not inspect upload ${messageFileId || "unknown"}: ${error && error.message || error}`);
            }
          }
        }
        skip += messages.length;
        if (messages.length < 100) break;
      }
      if (changed) await writeIndex(persistence, PROTECTED_ROOMS.kassa.index, index);
      return index;
    }
    async function sendTodayTransferSummary(message, read, persistence, modify, logger, http, config) {
      const index = await repairTodayReceiptIndex(message, read, persistence, modify, http, config, logger);
      const targetDate = expectedReceiptDate(config);
      const seen = {};
      let count = 0;
      let total = 0;
      let legacyMissing = 0;
      for (const entry of index.photos) {
        if (!entry || entry.source === "pre" || entry.source === "invalid" || entry.source === "rejected" || entry.source === "archive_failed" || entry.source === "duplicate") continue;
        const accountingRoomId = entry.resultRoomId || entry.roomId;
        if (accountingRoomId && message.room && accountingRoomId !== message.room.id) continue;
        if (dateFromEntry(entry, config) !== targetDate) continue;
        const key = normalizedReceiptIdentityKey(entry.receiptIdentity) || String(entry.exact || "");
        if (key && seen[key]) continue;
        if (key) seen[key] = true;
        const amount = amountFromEntry(entry);
        if (amount === void 0) {
          legacyMissing += 1;
          continue;
        }
        count += 1;
        total += amount;
      }
      const formatted = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.round(total * 100) / 100);
      let text = `*ПЕРЕВОДЫ ЗА ${displayDate(targetDate)}*\nЧеков: *${count}*\nСумма: *${formatted} ₽*`;
      if (legacyMissing) text += `\nНе учтено старых чеков без сохранённой суммы: ${legacyMissing}`;
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!appUser || !message.room) return;
      const builder = modify.getCreator().startMessage().setSender(appUser).setRoom(message.room).setText(text);
      await modify.getCreator().finish(builder);
    }
    async function seedRoom(read, persistence, logger, roomName, protectedRoom) {
      const room = await read.getRoomReader().getByName(roomName);
      if (!room) return;
      const current = await readIndex(read, protectedRoom.index);
      if (current.seededAt) return;
      const photos = current.photos.slice();
      let skip = 0;
      let imported = 0;
      let failures = 0;
      while (skip < 5e3) {
        const messages = await read.getRoomReader().getMessages(room.id, {
          limit: 100,
          skip,
          sort: { createdAt: "desc" },
          showThreadMessages: true
        });
        if (!messages || !messages.length) break;
        for (const message of messages) {
          const files = [];
          if (message.file) files.push(message.file);
          if (Array.isArray(message.files)) files.push(...message.files);
          for (const messageFile of files) {
            if (!messageFile || !/^image\//i.test(String(messageFile.type || ""))) continue;
            try {
        const upload = await read.getUploadReader().getById(messageFile._id);
        const content = await read.getUploadReader().getBufferById(messageFile._id);
              const exact = exactHash(content);
              if (photos.some((entry) => entry.exact === exact)) continue;
              photos.push({
                exact,
                visual: visualHash(
                  { name: messageFile.name || upload.name, type: messageFile.type || upload.type },
                  content
                ),
                uploadedAt: message.createdAt ? new Date(message.createdAt).getTime() : Date.now(),
                userId: message.sender && message.sender.id ? message.sender.id : ""
              });
              imported += 1;
            } catch (_2) {
              failures += 1;
            }
          }
        }
        skip += messages.length;
        if (messages.length < 100) break;
      }
      current.photos = photos;
      current.seededAt = Date.now();
      await writeIndex(persistence, protectedRoom.index, current);
      if (logger) logger.info(`Duplicate guard indexed ${imported} existing ${protectedRoom.kind} files; failures: ${failures}`);
    }
    async function seedExistingPhotos(read, persistence, logger) {
      await seedRoom(read, persistence, logger, "Otchet", PROTECTED_ROOMS.otchet);
      await seedRoom(read, persistence, logger, "otchet", PROTECTED_ROOMS.otchet);
    }
    module2.exports = {
      exactHash,
      expectedReceiptDate,
      visualHash,
      hammingDistance,
      guardUpload,
      rejectDuplicateMessage,
      seedExistingPhotos,
      claimPostMessage,
      completePostMessageClaim,
      cleanupDuplicateReportForwardsInOtchet,
      cleanupMailingProofForwardsInOtchet,
      fastForwardPersonalReportPhotos,
      publishPendingReportPhotos,
      resetInvisiblePermalinkForwards,
      resetStaleReportPhotoForwards,
      isMasterTransferSumRequest,
      sendMasterTransferSummaryRequest,
      isTodayTransferSumRequest,
      sendTodayTransferSummary,
      confirmedTransferSummaryForUser,
      publishMasterTransferSummary,
      readIndex,
      writeIndex,
      PROTECTED_ROOMS,
      isDirectRoom,
      isMasterPrivateRoom,
      isPersonalTarsRoom,
      isTarsAppMessage,
      messageDescriptorText,
      looksLikeMailingProofText,
      directFileIntent,
      isArchiveRoom,
      isKnownArchiveRoom,
      localCalendarParts,
      personalChatCleanupReady,
      personalChatMessageIsExpired,
      archiveAndCleanupPersonalRoomAtNoon,
      cleanupExpiredMasterRoom,
      cleanupArchivedReceiptMessages,
      cleanupExpiredReceiptArchive,
      readArchivedReceipts,
      createArchiveDownloadUrl
    };
  }
});

// build_0.5.3/TarsReportApp.js
Object.defineProperty(exports, "__esModule", { value: true });
exports.TarsReportApp = void 0;
var T = require("@rocket.chat/apps-engine/definition/accessors");
var A = require("@rocket.chat/apps-engine/definition/api");
var j = require("@rocket.chat/apps-engine/definition/App");
var y = require("@rocket.chat/apps-engine/definition/metadata");
var Y = require("@rocket.chat/apps-engine/definition/rooms");
var J = require("@rocket.chat/apps-engine/definition/scheduler");
var z = require("@rocket.chat/apps-engine/definition/settings");
var v = require("@rocket.chat/apps-engine/definition/ui");
var $ = require("@rocket.chat/apps-engine/definition/uikit");
var G = require_upload_duplicate_guard();
var N = "open-hairdresser-report";
var B = "open-hairdresser-report-from-table";
var F = "open-female-hairdresser-report-from-table";
var L = "open-brow-report-from-table";
var U = "open-manicure-report-from-table";
var P = "hairdresser-report:";
var q = "report-profile:";
var b = "value";
var M = "https://gsnvlabchat.ru/api/apps/public/4c07ba1e-e87d-4d85-9e76-7d818d567439/report-form";
var W = M;
var H = M;
var V = M;
var D = 72 * 60 * 60 * 1e3;
var _ = [
  {
    id: "haircut",
    label: "\u0421\u0442\u0440\u0438\u0436\u043A\u0430",
    kind: "service"
  },
  {
    id: "beard",
    label: "\u0411\u043E\u0440\u043E\u0434\u0430",
    kind: "service"
  },
  {
    id: "coloring",
    label: "\u041E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u043D\u0438\u0435",
    kind: "service",
    expense: true
  },
  {
    id: "sale",
    label: "\u041F\u0440\u043E\u0434\u0430\u0436\u0430 200 \u20BD",
    kind: "sale"
  },
  {
    id: "tip",
    label: "Чай переводом",
    kind: "tip"
  },
  {
    id: "other",
    label: "\u0414\u0440\u0443\u0433\u0430\u044F \u0443\u0441\u043B\u0443\u0433\u0430",
    kind: "service",
    customName: true
  },
  {
    id: "extra",
    label: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430",
    kind: "service",
    customName: true
  }
];
var recentPostMessageIds = /* @__PURE__ */ new Set();
var recentPostUploadIds = /* @__PURE__ */ new Set();
var lastReceiptCleanupAt = 0;
var C = class extends j.App {
  constructor(e, n, t) {
    super(e, n, t);
  }
  async extendConfiguration(e) {
    await e.settings.provideSetting({
      id: "yandex_ocr_api_key",
      type: z.SettingType.PASSWORD,
      required: false,
      public: false,
      i18nLabel: "yandex_ocr_api_key_label",
      i18nDescription: "yandex_ocr_api_key_description"
    });
    await e.settings.provideSetting({
      id: "yandex_ocr_folder_id",
      type: z.SettingType.STRING,
      required: false,
      public: false,
      i18nLabel: "yandex_ocr_folder_id_label",
      i18nDescription: "yandex_ocr_folder_id_description"
    });
    await e.settings.provideSetting({
      id: "openai_receipt_api_key",
      type: z.SettingType.PASSWORD,
      required: false,
      public: false,
      i18nLabel: "openai_receipt_api_key_label",
      i18nDescription: "openai_receipt_api_key_description"
    });
    await e.settings.provideSetting({
      id: "openai_receipt_model",
      type: z.SettingType.STRING,
      packageValue: "gpt-4.1-mini",
      required: false,
      public: false,
      i18nLabel: "openai_receipt_model_label",
      i18nDescription: "openai_receipt_model_description"
    });
    await e.settings.provideSetting({
      id: "receipt_timezone",
      type: z.SettingType.STRING,
      packageValue: "Europe/Astrakhan",
      required: false,
      public: false,
      i18nLabel: "receipt_timezone_label",
      i18nDescription: "receipt_timezone_description"
    });
    await e.settings.provideSetting({
      id: "receipt_workday_cutoff",
      type: z.SettingType.NUMBER,
      packageValue: 0,
      required: false,
      public: false,
      i18nLabel: "receipt_workday_cutoff_label",
      i18nDescription: "receipt_workday_cutoff_description"
    });
    await e.settings.provideSetting({
      id: "receipt_owner_username",
      type: z.SettingType.STRING,
      packageValue: "teimur",
      required: false,
      public: false,
      i18nLabel: "receipt_owner_username_label",
      i18nDescription: "receipt_owner_username_description"
    });
    await e.settings.provideSetting({
      id: "receipt_admin_username",
      type: z.SettingType.STRING,
      packageValue: "shura",
      required: false,
      public: false,
      i18nLabel: "receipt_admin_username_label",
      i18nDescription: "receipt_admin_username_description"
    });
    await e.settings.provideSetting({
      id: "receipt_result_room",
      type: z.SettingType.STRING,
      packageValue: "",
      required: false,
      public: false,
      i18nLabel: "receipt_result_room_label",
      i18nDescription: "receipt_result_room_description"
    });
    await e.settings.provideSetting({
      id: "master_private_chat_usernames",
      type: z.SettingType.STRING,
      required: false,
      public: false,
      i18nLabel: "master_private_chat_usernames_label",
      i18nDescription: "master_private_chat_usernames_description"
    });
    await e.settings.provideSetting({
      id: "master_private_chat_prefix",
      type: z.SettingType.STRING,
      packageValue: "tars-",
      required: false,
      public: false,
      i18nLabel: "master_private_chat_prefix_label",
      i18nDescription: "master_private_chat_prefix_description"
    });
    await e.settings.provideSetting({
      id: "receipt_archive_enabled",
      type: z.SettingType.BOOLEAN,
      packageValue: false,
      required: false,
      public: false,
      i18nLabel: "receipt_archive_enabled_label",
      i18nDescription: "receipt_archive_enabled_description"
    });
    await e.settings.provideSetting({
      id: "receipt_archive_bucket",
      type: z.SettingType.STRING,
      required: false,
      public: false,
      i18nLabel: "receipt_archive_bucket_label",
      i18nDescription: "receipt_archive_bucket_description"
    });
    await e.settings.provideSetting({
      id: "receipt_archive_access_key",
      type: z.SettingType.STRING,
      required: false,
      public: false,
      i18nLabel: "receipt_archive_access_key_label",
      i18nDescription: "receipt_archive_access_key_description"
    });
    await e.settings.provideSetting({
      id: "receipt_archive_secret_key",
      type: z.SettingType.PASSWORD,
      required: false,
      public: false,
      i18nLabel: "receipt_archive_secret_key_label",
      i18nDescription: "receipt_archive_secret_key_description"
    });
    e.scheduler.registerProcessors([{
      id: "archive-personal-rooms-noon",
      processor: async (jobContext, read, modify, http, persistence) => this.archivePersonalRoomsAtNoonJob(jobContext, read, modify, http, persistence),
      startupSetting: {
        type: J.StartupType.RECURRING,
        interval: "5 minutes",
        skipImmediate: true
      }
    }, {
      id: "cleanup-private-cash-rooms",
      processor: async (jobContext, read, modify, http, persistence) => this.cleanupPrivateCashRoomsJob(jobContext, read, modify, http, persistence),
      startupSetting: {
        type: J.StartupType.RECURRING,
        interval: "60 minutes",
        skipImmediate: true
      }
    }, {
      id: "scheduled-report-reminders",
      processor: async (jobContext, read, modify, http, persistence) => this.scheduledReportRemindersJob(jobContext, read, modify, http, persistence),
      startupSetting: {
        type: J.StartupType.RECURRING,
        interval: "5 minutes",
        skipImmediate: true
      }
    }, {
      id: "finalize-submitted-reports",
      processor: async (jobContext, read, modify, http, persistence) => this.finalizeSubmittedReportsJob(jobContext, read, modify, http, persistence),
      startupSetting: {
        type: J.StartupType.RECURRING,
        interval: "10 minutes",
        skipImmediate: true
      }
    }, {
      id: "forward-pending-report-photos",
      processor: this.forwardPendingReportPhotosJob
    }, {
      id: "forward-pending-report-photos-now",
      processor: this.forwardPendingReportPhotosJob
    }]);
    e.slashCommands.provideSlashCommand(new E(this)), e.slashCommands.provideSlashCommand(new ArchiveReceiptCommand(this)), e.slashCommands.provideSlashCommand(new ApproveReceiptCommand(this)), e.slashCommands.provideSlashCommand(new ScheduleCommand(this)), e.slashCommands.provideSlashCommand(new MasterChatCommand(this)), e.slashCommands.provideSlashCommand(new LatenessCommand(this, "opozdanie")), e.slashCommands.provideSlashCommand(new LatenessCommand(this, "late")), e.slashCommands.provideSlashCommand(new LatenessCommand(this, "shtraf")), e.slashCommands.provideSlashCommand(new LatenessCommand(this, "penalty")), e.slashCommands.provideSlashCommand(new LatenessCommand(this, "штраф")), e.api.provideApi({
      visibility: A.ApiVisibility.PUBLIC,
      security: A.ApiSecurity.UNSECURE,
      endpoints: [new S(this), new ReportFormEndpoint(this), new ReportFormScriptEndpoint(this)]
    });
  }
  async onInstall(e, n, t, s, r) {
    this.getLogger().info("TARS installed: fast report form package");
    try {
      await this.ensureCashRoomName(n, r);
      await G.cleanupDuplicateReportForwardsInOtchet(n, r, this.getLogger());
      const i = await this.receiptOcrConfig(n);
      await G.cleanupMailingProofForwardsInOtchet(n, r, t, i, this.getLogger());
      await this.refreshKnownPersonalReportRooms(n, r, s);
    } catch (a) {
      this.getLogger().warn(`Could not finish install maintenance: ${a && a.message || a}`);
    }
    this.getLogger().info("Receipt cleanup skipped during install; scheduled cleanup will run later.");
  }
  async onUpdate(e, n, t, s, r) {
    this.getLogger().info("TARS updated: fast report form package");
    try {
      await r.getScheduler().cancelJob("forward-pending-report-photos");
      await r.getScheduler().cancelJob("forward-pending-report-photos-now");
    } catch (schedulerError) {
      this.getLogger().warn(`Could not cancel legacy report photo jobs: ${schedulerError && schedulerError.message || schedulerError}`);
    }
    try {
      await this.ensureCashRoomName(n, r);
      await G.cleanupDuplicateReportForwardsInOtchet(n, r, this.getLogger());
      await G.resetStaleReportPhotoForwards(n, s, this.getLogger());
      await G.resetInvisiblePermalinkForwards(n, s, r, this.getLogger());
      const i = await this.receiptOcrConfig(n);
      await G.cleanupMailingProofForwardsInOtchet(n, r, t, i, this.getLogger());
      await G.publishPendingReportPhotos(n, s, r, this.getLogger(), t, i);
      await this.refreshKnownPersonalReportRooms(n, r, s);
    } catch (a) {
      this.getLogger().warn(`Could not finish update maintenance: ${a && a.message || a}`);
    }
    this.getLogger().info("Receipt cleanup skipped during update; scheduled cleanup will run later.");
  }
  async executePreFileUpload(e, n, t, s, r) {
    const config = await this.receiptOcrConfig(n);
    await G.guardUpload(e, n, s, r, this.getLogger(), t, config);
  }
  async checkPostMessageSent(e, n, t) {
    if (!e || !e.room) return false;
    if (await G.isKnownArchiveRoom(e && e.room, n)) return false;
    let c = !!this.parseMasterChatText(e && e.text) || !!this.parseLatenessText(e && e.text) || G.isPersonalTarsRoom(e.room);
    if (!c) return false;
    let r = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
    return !G.isTarsAppMessage(e, r);
  }
  async executePostMessageSent(e, n, t, s, r) {
    if (await G.isKnownArchiveRoom(e && e.room, n)) return;
    const appUser = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
    if (G.isTarsAppMessage(e, appUser)) return;
      const messageId = e && e.id ? String(e.id) : "";
    const uploadIds = [];
    const rememberUploadId = (file) => {
      const uploadId = String(file && (file._id || file.id) || "");
      if (uploadId && uploadIds.indexOf(uploadId) === -1) uploadIds.push(uploadId);
    };
    if (e && e.file) rememberUploadId(e.file);
    if (e && Array.isArray(e.files)) {
      for (const file of e.files) rememberUploadId(file);
    }
    const uploadEventKey = uploadIds.sort().join(",");
    const invocationId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let personalButtonAlreadyRefreshed = false;
    let postMessageClaimToken = "";
    let postMessageClaimFailed = false;
    const localSeen = Boolean(messageId && recentPostMessageIds.has(messageId));
    const localUploadSeen = Boolean(uploadEventKey && recentPostUploadIds.has(uploadEventKey));
    this.getLogger().info(`POST_PROBE invocation=${invocationId} message=${messageId || "none"} room=${String(e && e.room && (e.room.slugifiedName || e.room.id) || "none")} uploads=${uploadEventKey || "none"} localSeen=${localSeen} localUploadSeen=${localUploadSeen}`);
    if (localSeen || localUploadSeen) {
      this.getLogger().info(`POST_PROBE_SKIP_LOCAL invocation=${invocationId} message=${messageId || "none"} uploads=${uploadEventKey || "none"}`);
      return;
    }
      if (messageId) recentPostMessageIds.add(messageId);
      if (uploadEventKey) recentPostUploadIds.add(uploadEventKey);
      try {
        // Do not let the financial post-message claim suppress ordinary personal
        // work-photo forwarding. Receipt/financial processing claims below.
        const i = await this.receiptOcrConfig(n);
        if (await this.handleMonthlyScheduleMessage(e, n, s, r)) return;
        if (await this.handleMasterChatTextMessage(e, n, r, s)) return;
        if (await this.handleLatenessTextMessage(e, n, r, s)) return;
        if (this.isPersonalReportRoom(e && e.room) && this.isReportRequestText(e && e.text)) {
          await this.handleReportCommand(n, r, s, e.room, e.sender);
          personalButtonAlreadyRefreshed = true;
          return;
        }
        const hasImageUpload = (file) => {
          if (!file) return false;
          const type = String(file.type || file.mimeType || "");
          if (/^image\//i.test(type)) return true;
          const name = String(file.name || file.title || file.url || file.path || "").split("?")[0].toLowerCase();
          return /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(name);
        };
        const hasAttachmentImage = Array.isArray(e && e.attachments) && e.attachments.some((attachment) => hasImageUpload({
          type: attachment && attachment.imageUrl ? "image/jpeg" : "",
          name: attachment && attachment.title && (typeof attachment.title === "object" ? attachment.title.value : attachment.title) || "",
          url: attachment && (attachment.imageUrl || attachment.title && attachment.title.link) || ""
        }));
        const hasPersonalImageUpload = G.isPersonalTarsRoom(e && e.room) && (hasImageUpload(e && e.file) || Array.isArray(e && e.files) && e.files.some(hasImageUpload) || hasAttachmentImage);
        if (hasPersonalImageUpload && G.directFileIntent(e) !== "receipt" && G.directFileIntent(e) !== "mailing") {
          this.getLogger().info(`POST_DELAY_PERSONAL_PHOTO_FORWARD message=${messageId || "none"} uploads=${uploadEventKey || "none"}`);
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          if (await G.fastForwardPersonalReportPhotos(e, n, s, r, this.getLogger(), t, i)) {
            await this.refreshPreliminaryReportAnalysis(n, s, r, e.sender, e.room);
            return;
          }
        }
      if (uploadEventKey && !postMessageClaimToken) {
        postMessageClaimToken = await G.claimPostMessage(e, n, r, this.getLogger());
        if (!postMessageClaimToken) {
          this.getLogger().info(`POST_PROBE_SKIP_FINANCIAL_CLAIM invocation=${invocationId} message=${messageId || "none"} uploads=${uploadEventKey || "none"}`);
          return;
        }
      }
      if (await G.rejectDuplicateMessage(e, n, s, r, this.getLogger(), t, i)) return;
      if (hasPersonalImageUpload && G.directFileIntent(e) !== "mailing") {
        await this.refreshPreliminaryReportAnalysis(n, s, r, e.sender, e.room);
      }
      if (G.isMasterTransferSumRequest(e) && await G.sendMasterTransferSummaryRequest(e, n, s, r, this.getLogger(), t, i)) return;
      if (G.isTodayTransferSumRequest(e)) await G.sendTodayTransferSummary(e, n, s, r, this.getLogger(), t, i);
    } catch (a) {
      postMessageClaimFailed = true;
      this.getLogger().warn(`Could not handle post-message event: ${a && a.message || a}`);
    } finally {
      if (postMessageClaimToken && !postMessageClaimFailed) {
        try {
          await G.completePostMessageClaim(e, postMessageClaimToken, r, this.getLogger());
        } catch (claimError) {
          this.getLogger().warn(`Could not complete post-message claim: ${claimError && claimError.message || claimError}`);
        }
      }
      if (!personalButtonAlreadyRefreshed && this.isPersonalReportRoom(e && e.room) && e && e.sender) {
        await this.refreshPersonalReportButton(n, r, s, e.room, e.sender);
      }
      if (messageId) setTimeout(() => recentPostMessageIds.delete(messageId), 6e4);
      if (uploadEventKey) setTimeout(() => recentPostUploadIds.delete(uploadEventKey), 6e4);
    }
  }
  async receiptOcrConfig(e) {
    const n = e.getEnvironmentReader().getSettings();
    const t = String(await n.getValueById("receipt_timezone") || "");
    const cutoffSetting = await n.getValueById("receipt_workday_cutoff");
    return {
      apiKey: String(await n.getValueById("yandex_ocr_api_key") || "").replace(/[^A-Za-z0-9_-]/g, ""),
      folderId: String(await n.getValueById("yandex_ocr_folder_id") || "").replace(/[^A-Za-z0-9_-]/g, ""),
      openaiApiKey: String(await n.getValueById("openai_receipt_api_key") || "").trim(),
      openaiReceiptModel: String(await n.getValueById("openai_receipt_model") || "gpt-4.1-mini").trim() || "gpt-4.1-mini",
      timeZone: !t || t === "Europe/Moscow" ? "Europe/Astrakhan" : t,
      cutoffHour: Number(cutoffSetting === void 0 || cutoffSetting === null || cutoffSetting === "" ? 0 : cutoffSetting),
      ownerUsername: String(await n.getValueById("receipt_owner_username") || "teimur"),
      adminUsername: String(await n.getValueById("receipt_admin_username") || "shura"),
      resultRoomName: String(await n.getValueById("receipt_result_room") || ""),
      reviewRejectedReceipts: true,
      // The private Rocket.Chat room cheki-arhiv is the primary receipt
      // archive and is always enabled. The old switch controlled the removed
      // external Object Storage backend and must not disable this archive.
      archiveEnabled: true,
      archiveBucket: String(await n.getValueById("receipt_archive_bucket") || "").trim(),
      archiveAccessKey: String(await n.getValueById("receipt_archive_access_key") || "").trim(),
      archiveSecretKey: String(await n.getValueById("receipt_archive_secret_key") || "").trim()
    };
  }
  async handleReceiptArchiveCommand(e, n, t, s, r, a = []) {
    if (!e || !n || !s || !r) return;
    const config = await this.receiptOcrConfig(e), currentUsername = String(r.username || "").toLowerCase(), allowed = ["teimur", "shura", config.ownerUsername, config.adminUsername].map((value) => String(value || "").replace(/^@/, "").toLowerCase()).filter(Boolean), appUser = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!appUser) return;
    const notify = async (text) => {
      const notifier = n.getNotifier(), message = notifier.getMessageBuilder().setSender(appUser).setRoom(s).setText(text).getMessage();
      await notifier.notifyUser(r, message);
    };
    if (allowed.indexOf(currentUsername) === -1) {
      await notify("🚫 Архив чеков доступен только Теймуру и Шуре.");
      return;
    }
    if (!config.archiveEnabled) {
      await notify("⚠️ Архив чеков выключен. Включите архив в настройках Тарса.");
      return;
    }
    let date = G.expectedReceiptDate(config), username = "";
    for (const rawArgument of a || []) {
      const argument = String(rawArgument || "").trim();
      let match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(argument);
      if (match) {
        date = `${match[3]}-${match[2]}-${match[1]}`;
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(argument)) {
        date = argument;
        continue;
      }
      if (argument) username = argument.replace(/^@/, "").toLowerCase();
    }
    let entries = await G.readArchivedReceipts(e, date), seen = {};
    entries = entries.filter((entry) => {
      if (!entry || !entry.archiveKey || entry.archiveStatus !== "stored") return false;
      if (username && String(entry.username || "").toLowerCase() !== username) return false;
      const key = String(entry.exact || entry.archiveKey);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort((left, right) => Number(right.archivedAt || 0) - Number(left.archivedAt || 0));
    const displayDate = date.split("-").reverse().join(".");
    if (!entries.length) {
      await notify(`В архиве нет чеков за ${displayDate}${username ? ` для @${username}` : ""}.`);
      return;
    }
    const visibleEntries = entries.slice(0, 10), lines = visibleEntries.map((entry, index) => {
      const url = G.createArchiveDownloadUrl(entry, config, 3600), master = entry.username ? `@${entry.username}` : entry.userName || entry.userId || "мастер", amount = Number(entry.receiptAmount), amountText = Number.isFinite(amount) ? this.formatRubles(amount) : "сумма не распознана";
      return `${index + 1}. ${url ? `[ОТКРЫТЬ ЧЕК](${url})` : "ЧЕК СОХРАНЁН"} — ${master} · ${amountText}`;
    });
    let text = `*🗄 АРХИВ ЧЕКОВ ЗА ${displayDate}*\n${lines.join("\n")}\n\nДоступ только Теймуру и Шуре.`;
    if (entries.length > visibleEntries.length) text += `\nПоказано ${visibleEntries.length} из ${entries.length}. Укажите логин мастера: /cheki @login ${displayDate}`;
    await notify(text);
  }
  async handleApproveReceiptCommand(e, n, t, s, r, a = []) {
    if (!e || !n || !t || !s || !r) return;
    const config = await this.receiptOcrConfig(e);
    const currentUsername = String(r.username || "").toLowerCase();
    const allowed = ["teimur", "shura", config.ownerUsername, config.adminUsername].map((value) => String(value || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
    const appUser = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!appUser) return;
    const notify = async (text) => {
      const notifier = n.getNotifier(), message = notifier.getMessageBuilder().setSender(appUser).setRoom(s).setText(text).getMessage();
      await notifier.notifyUser(r, message);
    };
    if (allowed.indexOf(currentUsername) === -1) {
      await notify("🚫 Принятие чеков вручную доступно только Теймуру и Шуре.");
      return;
    }
    let targetUsername = "";
    let targetAmount;
    let targetDate = G.expectedReceiptDate(config);
    for (const rawArgument of a || []) {
      const argument = String(rawArgument || "").trim();
      if (!argument) continue;
      let dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(argument);
      if (dateMatch) {
        targetDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(argument)) {
        targetDate = argument;
        continue;
      }
      const numeric = Number(argument.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(numeric) && numeric > 0 && targetAmount === void 0) {
        targetAmount = numeric;
        continue;
      }
      if (argument.charAt(0) === "@" || !targetUsername) targetUsername = argument.replace(/^@/, "").toLowerCase();
    }
    if (!targetUsername || targetAmount === void 0) {
      await notify("Формат: /prinyat @логин сумма [ДД.ММ.ГГГГ]\nНапример: /prinyat @teimur 1000");
      return;
    }
    const index = await G.readIndex(e, G.PROTECTED_ROOMS.kassa.index);
    const candidates = (index.photos || []).filter((entry) => {
      if (!entry || entry.source !== "rejected") return false;
      if (String(entry.username || "").toLowerCase() !== targetUsername) return false;
      if (String(entry.receiptDate || "") !== targetDate) return false;
      const amount = Number(entry.receiptAmount);
      return Number.isFinite(amount) && Math.abs(amount - targetAmount) < 0.01;
    }).sort((left, right) => Number(right.uploadedAt || 0) - Number(left.uploadedAt || 0));
    const entry = candidates[0];
    const displayDateText = targetDate.split("-").reverse().join(".");
    if (!entry) {
      await notify(`Не найден отклонённый чек @${targetUsername} на сумму ${this.formatRubles(targetAmount)} за ${displayDateText}.\nПроверьте логин, сумму и дату.`);
      return;
    }
    const originalReason = entry.invalidReason || "";
    entry.source = "confirmed";
    entry.invalidReason = "";
    entry.manualApprovalNote = originalReason;
    entry.approvedBy = r.username || r.name || r.id || "";
    entry.approvedAt = Date.now();
    entry.validationVersion = 11;
    await G.writeIndex(t, G.PROTECTED_ROOMS.kassa.index, index);
    if (entry.roomId) {
      try {
        const masterRoom = await e.getRoomReader().getById(entry.roomId);
        if (masterRoom) {
          await G.publishMasterTransferSummary({
            userId: entry.userId || "",
            receiptDate: targetDate,
            username: entry.username || targetUsername,
            userName: entry.userName || "",
            nameCandidates: [targetUsername]
          }, { room: masterRoom }, e, t, n, config, this.getLogger());
        }
      } catch (error) {
        this.getLogger().warn(`Could not refresh master transfer summary after manual approval: ${error && error.message || error}`);
      }
    }
    await notify(`✅ ЧЕК ПРИНЯТ ВРУЧНУЮ\nМастер: @${targetUsername}\nСумма: ${this.formatRubles(targetAmount)}\nДата: ${displayDateText}\nБыла причина отказа: ${originalReason || "—"}\nПринял: @${currentUsername}`);
  }
  async executeActionButtonHandler(e, n, t, s, r) {
    let a = e.getInteractionData();
    if (a.actionId === N) {
      if (a.room) {
        const i = await this.receiptOcrConfig(n);
        await G.cleanupExpiredMasterRoom(a.room, a.user, n, r, i, this.getLogger());
      }
      await this.handleReportCommand(n, r, s, a.room, a.user, true);
    }
    return e.getInteractionResponder().successResponse();
  }
  async executeBlockActionHandler(e, n, t, s, r) {
    let a = e.getInteractionData();
    if (a.actionId === N && a.room) {
      const i = await this.receiptOcrConfig(n);
      await G.cleanupExpiredMasterRoom(a.room, a.user, n, r, i, this.getLogger());
      await this.handleReportCommand(n, r, s, a.room, a.user, true);
      return e.getInteractionResponder().successResponse();
    }
    if ((a.actionId === B || a.actionId === F || a.actionId === L || a.actionId === U) && a.room) {
      const i = await this.receiptOcrConfig(n);
      await G.cleanupExpiredMasterRoom(a.room, a.user, n, r, i, this.getLogger());
      await this.selectReportProfile(n, r, s, a.room, a.user, a.actionId === F ? "female" : a.actionId === L ? "brow" : a.actionId === U ? "manicure" : "male");
    }
    return e.getInteractionResponder().successResponse();
  }
  modalRowsForReportType(e = "male") {
    if (e === "female") return [
      { id: "female_cut", label: "Женская стрижка", kind: "service" },
      { id: "styling", label: "Укладка", kind: "service" },
      { id: "simple_color_1", label: "Простое окрашивание", kind: "service", expense: true },
      { id: "simple_color_2", label: "Простое окрашивание", kind: "service", expense: true },
      { id: "complex_color_1", label: "Сложное окрашивание", kind: "service", expense: true },
      { id: "complex_color_2", label: "Сложное окрашивание", kind: "service", expense: true },
      { id: "care", label: "Уход за волосами", kind: "service", expense: true },
      { id: "sale", label: "Продажа 200 ₽", kind: "sale" },
      { id: "tip", label: "Чай переводом", kind: "tip" },
      { id: "other", label: "Другая услуга", kind: "service", customName: true, expense: true }
    ];
    if (e === "brow") return [
      { id: "brow_arch_color", label: "Архитектура + окрашивание", kind: "service" },
      { id: "brow_arch", label: "Архитектура", kind: "service" },
      { id: "brow_lamination", label: "Долговременная укладка", kind: "service" },
      { id: "male_brow", label: "Мужские брови", kind: "service" },
      { id: "lashes_color", label: "Окрашивание ресниц", kind: "service" },
      { id: "brow_light", label: "Осветление бровей", kind: "service" },
      { id: "tip", label: "Чай переводом", kind: "tip" },
      { id: "other", label: "Пустая строка", kind: "service", customName: true }
    ];
    if (e === "manicure") return [
      { id: "mani_no_cover", label: "Маникюр без покрытия", kind: "service" },
      { id: "mani_cover", label: "Маникюр с покрытием", kind: "service" },
      { id: "mani_strong", label: "Маникюр с укреплением", kind: "service" },
      { id: "extension", label: "Наращивание ногтей", kind: "service" },
      { id: "pedi_no_cover_no_foot", label: "Педикюр без покрытия без стопы", kind: "service" },
      { id: "pedi_cover_no_foot", label: "Педикюр с покрытием без стопы", kind: "service" },
      { id: "pedi_no_cover_foot", label: "Педикюр без покрытия со стопой", kind: "service" },
      { id: "pedi_cover_foot", label: "Педикюр с покрытием со стопой", kind: "service" },
      { id: "repair", label: "Ремонт", kind: "service" },
      { id: "design", label: "Дизайн", kind: "service" },
      { id: "remove_old", label: "Снятие чужой работы", kind: "service" },
      { id: "tip", label: "Чай переводом", kind: "tip" },
      { id: "other", label: "Пустая строка", kind: "service", customName: true }
    ];
    return _;
  }
  reportModalTitle(e = "male") {
    return e === "female" ? "Женский отчёт" : e === "brow" ? "Отчёт бровиста" : e === "manicure" ? "Отчёт маникюра" : "Мужской отчёт";
  }
  async openReportFromButton(e, n, t, s, r, a) {
    const room = s;
    if (!room || !this.isPersonalReportRoom(room)) {
      this.getLogger().warn("Report button ignored outside personal TARS chat");
      return;
    }
    if (a) {
      try {
        await this.openReportModal(n, r, room, a, "male");
        return;
      } catch (o) {
        this.getLogger().warn(`Could not open report modal from button, sending personal link instead: ${o && o.message || o}`);
      }
    }
    await this.sendReportMenu(e, n, room, r);
  }
  async openReportModal(e, n, t, s, reportType = "male") {
    let r = e.getCreator().getBlockBuilder();
    r.addSectionBlock({
      text: r.newMarkdownTextObject(
        "*\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u043F\u043E\u0437\u0438\u0446\u0438\u0438.* \u0414\u0430\u0442\u0430 \u0438 \u043C\u0430\u0441\u0442\u0435\u0440 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."
      )
    }), this.modalRowsForReportType(reportType).forEach((a, o) => this.addReportRow(r, a, o + 1)), this.addPaymentInputs(r), await e.getUiController().openSurfaceView(
      {
        id: `${P}${t.id}:${reportType}`,
        type: $.UIKitSurfaceType.MODAL,
        title: r.newPlainTextObject(this.reportModalTitle(reportType)),
        blocks: r.getBlocks(),
        submit: r.newButtonElement({
          actionId: "submit-hairdresser-report",
          text: r.newPlainTextObject(
            "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0447\u0451\u0442"
          )
        }),
        close: r.newButtonElement({
          actionId: "close-hairdresser-report",
          text: r.newPlainTextObject(
            "\u041E\u0442\u043C\u0435\u043D\u0430"
          )
        })
      },
      { triggerId: s },
      t
    );
  }
  async executeViewSubmitHandler(e, n, t, s, r) {
    let a = e.getInteractionData(), o = a.view.id || "";
    if (!o.startsWith(P))
      return e.getInteractionResponder().successResponse();
    let viewPayload = o.slice(P.length), reportType = "male", separator = viewPayload.lastIndexOf(":");
    if (separator !== -1) {
      reportType = viewPayload.slice(separator + 1) || "male";
      viewPayload = viewPayload.slice(0, separator);
    }
    reportType = reportType === "female" ? "female" : reportType === "brow" ? "brow" : reportType === "manicure" ? "manicure" : "male";
    let c = a.view.state || {}, d = {}, m = [], modalRows = this.modalRowsForReportType(reportType);
    modalRows.forEach((l) => {
      let k = this.getValue(c, `${l.id}-amount`), i = this.getValue(c, `${l.id}-quantity`), p = l.customName ? this.getValue(c, `${l.id}-name`) : l.label, expenseRaw = l.expense ? this.getValue(c, `${l.id}-expense`) : "";
      if (!k && !i && (!l.customName || !p)) return;
      let isFixedSale = l.kind === "sale", w = isFixedSale ? this.parsePositiveNumber(i) : i ? this.parsePositiveNumber(i) : 1, R = isFixedSale && w !== void 0 ? 200 * w : this.parsePositiveNumber(k);
      let expense = 0;
      if (expenseRaw) {
        expense = this.parsePositiveNumber(expenseRaw);
        expense === void 0 && (d[`${l.id}-expense`] = "Расход должен быть цифрами");
      } else if (reportType === "female" && l.expense) {
        let autoExpense = this.defaultFemaleExpense(p, w);
        expense = autoExpense === null ? 0 : autoExpense;
      }
      (R === void 0 || R <= 0) && (d[`${l.id}-amount`] = "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043C\u043C\u0443 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0443\u043B\u044F"), (w === void 0 || w <= 0 || !Number.isInteger(w)) && (d[`${l.id}-quantity`] = "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0446\u0435\u043B\u044B\u043C \u0447\u0438\u0441\u043B\u043E\u043C"), l.customName && !p && (d[`${l.id}-name`] = "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438"), R !== void 0 && R > 0 && w !== void 0 && w > 0 && Number.isInteger(w) && p && expense !== void 0 && m.push({
        label: p,
        quantity: w,
        unitPrice: l.kind === "sale" ? 200 : l.kind === "tip" ? R : R / w,
        amount: R,
        expense: l.kind === "tip" ? Math.min(50, R) : Math.min(expense || 0, R),
        netAmount: l.kind === "tip" ? Math.max(R - Math.min(50, R), 0) : Math.max(R - Math.min(expense || 0, R), 0),
        kind: l.kind
      });
    });
    let u = this.getValue(c, "cash-amount"), I = this.getValue(c, "transfers-amount"), cashMissing = String(u || "").trim() === "", transfersMissing = String(I || "").trim() === "", f = cashMissing ? void 0 : this.parsePositiveNumber(u), h = transfersMissing ? void 0 : this.parsePositiveNumber(I);
    if (cashMissing && (d["cash-amount"] = "Заполните наличные. Если нет — поставьте 0"), transfersMissing && (d["transfers-amount"] = "Заполните чеки / переводы. Если нет — поставьте 0"), f === void 0 && !cashMissing && (d["cash-amount"] = "Введите сумму наличных цифрами"), h === void 0 && !transfersMissing && (d["transfers-amount"] = "Введите сумму чеков / переводов цифрами"), Object.keys(d).length > 0)
      return e.getInteractionResponder().viewErrorResponse({ viewId: o, errors: d });
    if (m.length === 0)
      return e.getInteractionResponder().viewErrorResponse({
        viewId: o,
        errors: {
          "haircut-amount": "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0441\u0442\u0440\u043E\u043A\u0443"
        }
      });
    let O = viewPayload, g = await n.getRoomReader().getById(O);
    if (g) {
      const i = await this.receiptOcrConfig(n);
      try {
        await G.cleanupExpiredMasterRoom(g, a.user, n, r, i, this.getLogger());
      } catch (cleanupError) {
        this.getLogger().warn(`Could not cleanup room before modal report submit: ${cleanupError && cleanupError.message || cleanupError}`);
      }
      const workday = this.reportWorkday(), association = this.reportAssociation(a.user.id, reportType, workday), previous = await n.getPersistenceReader().readByAssociation(association), latest = (previous || []).filter((entry) => entry && entry.userId === a.user.id && entry.reportType === reportType && entry.workday === workday).sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0], personalRoom = this.isPersonalReportRoom(g) ? g : void 0, publicRoom = await this.getPublicReportRoom(n), appUser = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser(), transferVerification = await G.confirmedTransferSummaryForUser(n, i, a.user.id, workday), mailingProof = await this.mailingProofStatus(n, a.user, workday), reportPhoto = await this.reportPhotoStatus(n, a.user, workday);
      const penalties = await this.latenessSummary(n, a.user.id, workday);
      if (!personalRoom) return e.getInteractionResponder().viewErrorResponse({ viewId: o, errors: { "haircut-amount": "Отчёт теперь отправляется только из личного чата TARS" } });
      let messageId = latest && latest.messageId || "", publicMessageId = latest && latest.publicMessageId || "", ownerSummaryMessageId = latest && latest.ownerSummaryMessageId || "", preliminaryMessageId = latest && latest.preliminaryMessageId || "";
      const scheduleStatus = await this.masterScheduleStatus(n, a.user, workday), firstSubmittedAt = latest && latest.firstSubmittedAt ? Number(latest.firstSubmittedAt) : Date.now(), timeCorrection = this.reportTimeCorrection(firstSubmittedAt, scheduleStatus);
      if (latest && latest.roomId && latest.roomId !== personalRoom.id) messageId = "";
      messageId = await this.sendReport(r, personalRoom, a.user, m, f || 0, h || 0, reportType, messageId, transferVerification, a.user, 0, mailingProof, timeCorrection, penalties, true);
      ownerSummaryMessageId = await this.sendOwnerShortReport(r, n, a.user, m, f || 0, h || 0, reportType, ownerSummaryMessageId, transferVerification, 0, mailingProof, timeCorrection, penalties, true, workday);
      if (publicRoom && appUser) {
        try {
          publicMessageId = await this.sendPublicClientSummary(r, publicRoom, appUser, m, a.user, reportType, publicMessageId);
        } catch (publicError) {
        this.getLogger().warn(`Could not publish modal public client summary: ${publicError && publicError.message || publicError}`);
        }
      }
      if (Date.now() < this.reportFinalDueAt(firstSubmittedAt, workday)) {
        preliminaryMessageId = await this.sendPreliminaryReportAnalysis(r, n, personalRoom, a.user, transferVerification, reportPhoto, mailingProof, this.payrollRule(reportType, m, 0, mailingProof), preliminaryMessageId) || "";
      } else {
        await this.deletePreliminaryReportAnalysis(r, n, preliminaryMessageId);
        preliminaryMessageId = "";
      }
      await s.removeByAssociation(association);
      await s.createWithAssociation({
        userId: a.user.id,
        reportType,
        workday,
        roomId: personalRoom.id,
        sourceRoomId: personalRoom.id,
        messageId,
        personalMessageId: "",
        publicMessageId,
        ownerSummaryMessageId,
        preliminaryMessageId,
        firstSubmittedAt,
        timeCorrection,
        scheduleStatus,
        formData: this.submittedFormData({ rows: m, cash: f || 0, transfers: h || 0, mailings: 0 }),
        updatedAt: Date.now()
      }, association);
      await this.upsertReportFinalizeQueue(s, {
        userId: a.user.id,
        username: a.user.username || "",
        reportType,
        workday,
        dueAt: this.reportFinalDueAt(firstSubmittedAt, workday),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      return e.getInteractionResponder().successResponse();
    }
    this.getLogger().error(`\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u043A\u043E\u043C\u043D\u0430\u0442\u0430 \u0434\u043B\u044F \u043E\u0442\u0447\u0451\u0442\u0430: ${O}`);
    return e.getInteractionResponder().errorResponse();
  }
  async postReportTable(e, n, t) {
    let s = e.getCreator().getBlockBuilder();
    s.addSectionBlock({
      text: s.newMarkdownTextObject(`*🟧 \u041C\u0423\u0416\u0421\u041A\u0418\u0415 \u041C\u0410\u0421\u0422\u0415\u0420\u0410 \xB7 50%*
\`\`\`
\u0423\u0421\u041B\u0423\u0413\u0410          \u0426\u0415\u041D\u0410   \u041A\u041E\u041B.
\u0421\u0442\u0440\u0438\u0436\u043A\u0430           \u2014      \u2014
\u0411\u043E\u0440\u043E\u0434\u0430             \u2014      \u2014
\u041E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u043D\u0438\u0435        \u2014      \u2014
\u0414\u0440\u0443\u0433\u0430\u044F \u0443\u0441\u043B\u0443\u0433\u0430      \u2014      \u2014
\u041F\u0440\u043E\u0434\u0430\u0436\u0430 100%       \u2014      \u2014
\u0427\u0430\u0439                \u2014      \u2014
\u0415\u0449\u0451 \u0441\u0442\u0440\u043E\u043A\u0430         \u2014      \u2014
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\u0418\u0442\u043E\u0433\u043E \u0443\u0441\u043B\u0443\u0433        \u2014      \u2014
\`\`\``)
    }), s.addSectionBlock({
      text: s.newMarkdownTextObject(`*\u041E\u043F\u043B\u0430\u0442\u0430:* \u043D\u0430\u043B\u0438\u0447\u043D\u044B\u0435 \xB7 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u044B
*\u0418\u0442\u043E\u0433\u0438:* \u0432\u044B\u0440\u0443\u0447\u043A\u0430 \xB7 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u0430 \xB7 \u043A\u0430\u0441\u0441\u0430 \xB7 \u0440\u0430\u0437\u043D\u0438\u0446\u0430`)
    });
    let r = e.getCreator().startMessage().setSender(t).setRoom(n).setText(
      "\u041C\u0443\u0436\u0441\u043A\u0438\u0435 \u043C\u0430\u0441\u0442\u0435\u0440\u0430 \u2014 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u043E\u0442\u0447\u0451\u0442"
    ).setBlocks(s).addAttachment({ color: "#ff5a1f", text: "GSNV - LAB" });
    await e.getCreator().finish(r);
  }
  async postFemaleReportTable(e, n, t) {
    let s = e.getCreator().getBlockBuilder();
    s.addSectionBlock({
      text: s.newMarkdownTextObject(`*🟧 ЖЕНСКИЕ МАСТЕРА · 50%*
\`\`\`
УСЛУГА                 ЦЕНА   КОЛ.
Женская стрижка          —      —
Укладка                  —      —
Простое окрашивание      —      —
Простое окрашивание      —      —
Сложное окрашивание      —      —
Сложное окрашивание      —      —
Уход за волосами         —      —
Продажа 100%             —      —
Чай переводом          —      —
Другая услуга            —      —
───────────────────────────────
Итого услуг              —      —
\`\`\``)
    }), s.addSectionBlock({
      text: s.newMarkdownTextObject(`*Оплата:* наличные · переводы
*Итоги:* выручка · зарплата · касса · разница`)
    });
    let r = e.getCreator().startMessage().setSender(t).setRoom(n).setText("Женские мастера — заполнить отчёт").setBlocks(s).addAttachment({ color: "#ff5a1f", text: "GSNV - LAB" });
    await e.getCreator().finish(r);
  }
  async postBrowReportTable(e, n, t) {
    let s = e.getCreator().getBlockBuilder();
    s.addSectionBlock({
      text: s.newMarkdownTextObject(`*🟧 БРОВИСТЫ · 50%*
\`\`\`
УСЛУГА                       ЦЕНА   КОЛ.
Архитектура + окрашивание      —      —
Архитектура                    —      —
Долговременная укладка         —      —
Мужские брови                  —      —
Окрашивание ресниц             —      —
Осветление бровей              —      —
Чай переводом                —      —
Пустая строка                  —      —
─────────────────────────────────────
Итого услуг                    —      —
\`\`\``)
    }), s.addSectionBlock({
      text: s.newMarkdownTextObject(`*Оплата:* наличные · переводы
*Итоги:* выручка · зарплата · касса · разница`)
    });
    let r = e.getCreator().startMessage().setSender(t).setRoom(n).setText("Бровисты — заполнить отчёт").setBlocks(s).addAttachment({ color: "#ff5a1f", text: "GSNV - LAB" });
    await e.getCreator().finish(r);
  }
  async postManicureReportTable(e, n, t) {
    let s = e.getCreator().getBlockBuilder();
    s.addSectionBlock({
      text: s.newMarkdownTextObject(`*🟧 МАСТЕРА МАНИКЮРА · 50%*
\`\`\`
УСЛУГА                              ЦЕНА   КОЛ.
Маникюр без покрытия                  —      —
Маникюр с покрытием                   —      —
Маникюр с укреплением                 —      —
Наращивание ногтей                    —      —
Педикюр без покрытия без стопы        —      —
Педикюр с покрытием без стопы         —      —
Педикюр без покрытия со стопой        —      —
Педикюр с покрытием со стопой         —      —
Ремонт                                —      —
Дизайн                                —      —
Снятие чужой работы                   —      —
Чай переводом                         —      —
Пустая строка                         —      —
──────────────────────────────────────────
Итого услуг                           —      —
\`\`\``)
    }), s.addSectionBlock({
      text: s.newMarkdownTextObject(`*Оплата:* наличные · переводы
*Итоги:* выручка · зарплата · касса · разница`)
    });
    let r = e.getCreator().startMessage().setSender(t).setRoom(n).setText("Мастера маникюра — заполнить отчёт").setBlocks(s).addAttachment({ color: "#ff5a1f", text: "GSNV - LAB" });
    await e.getCreator().finish(r);
  }
  async postNextReportButton(e, n, t) {
    let s = e.getCreator().getBlockBuilder();
    s.addActionsBlock({
      elements: [
        s.newButtonElement({
          actionId: B,
          text: s.newPlainTextObject("МУЖСКОЙ ОТЧЁТ"),
          value: "personal-report"
        }),
        s.newButtonElement({
          actionId: F,
          text: s.newPlainTextObject("ЖЕНСКИЙ ОТЧЁТ"),
          value: "female-personal-report"
        }),
        s.newButtonElement({
          actionId: L,
          text: s.newPlainTextObject("ОТЧЁТ БРОВИСТА"),
          value: "brow-personal-report"
        }),
        s.newButtonElement({
          actionId: U,
          text: s.newPlainTextObject("ОТЧЁТ МАНИКЮРА"),
          value: "manicure-personal-report"
        })
      ]
    });
    let r = e.getCreator().startMessage().setSender(t).setRoom(n).setText("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043E\u0442\u0447\u0451\u0442").setBlocks(s).addAttachment({ color: "#ff5a1f", text: "GSNV - LAB" });
    await e.getCreator().finish(r);
  }
  async sendReportMenu(e, n, t, s) {
    let r = n.getCreator().getBlockBuilder();
    r.addSectionBlock({
      text: r.newMarkdownTextObject("*🟧 ВЫБЕРИТЕ НУЖНЫЙ ОТЧЁТ*")
    }), r.addActionsBlock({
      elements: [
        r.newButtonElement({
          actionId: B,
          text: r.newPlainTextObject("МУЖСКОЙ"),
          value: "personal-report"
        }),
        r.newButtonElement({
          actionId: F,
          text: r.newPlainTextObject("ЖЕНСКИЙ"),
          value: "female-personal-report"
        }),
        r.newButtonElement({
          actionId: L,
          text: r.newPlainTextObject("БРОВИСТ"),
          value: "brow-personal-report"
        }),
        r.newButtonElement({
          actionId: U,
          text: r.newPlainTextObject("МАНИКЮР"),
          value: "manicure-personal-report"
        })
      ]
    });
    let a = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!a) return;
    if (this.isMasterPrivateReportRoom(t)) {
      await this.removeLegacyPersonalReportMenus(e, n, t);
      let o = n.getCreator().startMessage().setSender(a).setRoom(t).setText("🟧 ВЫБЕРИТЕ НУЖНЫЙ ОТЧЁТ").setBlocks(r);
      await n.getCreator().finish(o);
      return;
    }
    let o = n.getNotifier(), c = o.getMessageBuilder().setSender(a).setRoom(t).setText("🟧 ВЫБЕРИТЕ НУЖНЫЙ ОТЧЁТ").setBlocks(r).getMessage();
    await o.notifyUser(s, c);
  }
  profileAssociation(e) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `${q}${e}`
    );
  }
  roomProfileAssociation(e) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `report-profile-room:${e}`
    );
  }
  reportAssociation(e, n, t) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `submitted-report:${e}:${n}:${t}`
    );
  }
  reportFinalizeQueueAssociation() {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      "report-finalize-queue:v1"
    );
  }
  reportFinalDueAt(e, n) {
    const t = Number(e || Date.now()) + 15 * 60 * 1e3;
    const s = /^\d{4}-\d{2}-\d{2}$/.test(String(n || "")) ? Date.parse(`${n}T17:00:00.000Z`) : NaN;
    return Number.isFinite(s) ? Math.max(t, s) : t;
  }
  reportReminderStartAt(e) {
    const n = /^\d{4}-\d{2}-\d{2}$/.test(String(e || "")) ? Date.parse(`${e}T16:15:00.000Z`) : NaN;
    return Number.isFinite(n) ? n : 0;
  }
  reportReminderDue(e, n = Date.now()) {
    const t = this.reportReminderStartAt(e && e.workday), s = Number(e && e.dueAt || 0), r = Number(e && e.lastReminderAt || 0);
    return Boolean(t && n >= t && (!s || n < s) && (!r || n - r >= 9 * 60 * 1e3));
  }
  reportReminderSlot(e = Date.now()) {
    const n = this.reportLocalMinutes(new Date(e));
    if (n < 19 * 60 + 45 || n >= 21 * 60) return "";
    let t = 19 * 60 + 45;
    if (n >= 20 * 60 + 15) t = 20 * 60 + 15 + Math.floor((n - (20 * 60 + 15)) / 10) * 10;
    else if (n >= 20 * 60) t = 20 * 60;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }
  reportScheduledReminderAssociation(e) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `scheduled-report-reminders:${e}`
    );
  }
  async hasSubmittedReportForWorkday(e, n, t) {
    if (!e || !n || !t) return false;
    for (const s of ["male", "female", "brow", "manicure"]) {
      try {
        const r = await e.getPersistenceReader().readByAssociation(this.reportAssociation(n, s, t));
        if ((r || []).some((a) => a && a.userId === n && a.workday === t && a.formData)) return true;
      } catch (_2) {
      }
    }
    return false;
  }
  async scheduledReportRemindersJob(e, n, t, s, r) {
    if (!n || !t || !r) return;
    const a = Date.now(), o = this.reportReminderSlot(a);
    if (!o) return;
    const c = this.reportWorkday(new Date(a)), d = this.reportScheduledReminderAssociation(c), m = await n.getPersistenceReader().readByAssociation(d), u = {};
    for (const x of m || []) {
      if (x && x.userId && x.slot) u[`${x.userId}:${x.slot}`] = true;
    }
    const I = await n.getPersistenceReader().readByAssociation(this.privateCashRoomsAssociation()), f = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
    if (!f) return;
    const h = [];
    for (const x of I || []) {
      if (!x || !x.roomId || !x.masterUserId) continue;
      const v = `${x.masterUserId}:${o}`;
      if (u[v]) continue;
      try {
        const C = await n.getRoomReader().getById(x.roomId);
        if (!C || !this.isPersonalReportRoom(C)) continue;
        const A = await n.getUserReader().getById(x.masterUserId);
        if (!A) continue;
        const K = await this.masterScheduleStatus(n, A, c);
        if (K && K.off) continue;
        if (await this.hasSubmittedReportForWorkday(n, x.masterUserId, c)) continue;
        const M = `⏰ Напоминание об отчёте\nСегодняшний отчёт нужно отправить до 21:00 по Астрахани.\nКонтрольная точка: ${o}. Нажмите нижнюю кнопку и заполните таблицу.`;
        const N = t.getCreator().startMessage().setSender(f).setRoom(C).setText(M);
        await t.getCreator().finish(N);
        u[v] = true;
        h.push({ userId: x.masterUserId, username: x.username || A.username || "", roomId: x.roomId, workday: c, slot: o, createdAt: a });
      } catch (C) {
        this.getLogger().warn(`Could not send scheduled report reminder to ${x.roomId}: ${C && C.message || C}`);
      }
    }
    for (const x of h) await r.createWithAssociation(x, d);
    if (h.length) this.getLogger().info(`Sent ${h.length} scheduled report reminder(s) for ${c} ${o}`);
  }
  async upsertReportFinalizeQueue(e, n) {
    if (!e || !n || !n.userId || !n.reportType || !n.workday) return;
    const t = this.reportFinalizeQueueAssociation(), s = await e.getPersistenceReader().readByAssociation(t), r = (s || []).filter((a) => a && !(a.userId === n.userId && a.reportType === n.reportType && a.workday === n.workday));
    await e.removeByAssociation(t);
    for (const a of r) await e.createWithAssociation(a, t);
    await e.createWithAssociation(n, t);
  }
  preliminaryReportIssues(e, n, t, s) {
    const r = [];
    if (!(e && Number(e.count) > 0)) r.push("фото отчёта");
    if (t && !t.limit.met && !(n && Number(n.count) > 0)) r.push("рассылки");
    if (s && Number(s.missing) > 0) r.push(`чеки без суммы: ${Number(s.missing)}`);
    if (s && Number.isFinite(Number(s.total)) && Number.isFinite(Number(s.reported)) && Math.abs(Number(s.total) - Number(s.reported)) > 0.005) r.push("переводы и чеки не совпадают");
    return r;
  }
  async sendPreliminaryReportAnalysis(e, n, t, s, r, a, o, c, previousMessageId = "", suppressCleanMessage = false) {
    if (!n || !t || !s || !r || !this.isPersonalReportRoom(t)) return;
    const d = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
    if (!d) return;
    const m = this.preliminaryReportIssues(a, o, c, r);
    try {
      await this.deletePreliminaryReportAnalysis(e, n, previousMessageId);
      if (!m.length && suppressCleanMessage) return "";
      const u = m.length ? `Предварительная проверка отчёта.\nНе хватает: ${m.join(", ")}.\nМожно догрузить до финальной проверки, штраф сейчас не применён.` : "Предварительная проверка отчёта: критичных недостающих данных не вижу. Финальный расчёт будет после проверки.";
      const I = e.getCreator().startMessage().setSender(d).setRoom(t).setText(u);
      return await e.getCreator().finish(I);
    } catch (I) {
      this.getLogger().warn(`Could not send preliminary report analysis: ${I && I.message || I}`);
    }
  }
  async deletePreliminaryReportAnalysis(e, n, t = "") {
    if (!e || !n || !t) return;
    try {
      const s = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
      if (!s) return;
      const r = await e.getUpdater().message(t, s), a = r.getMessage();
      if (a) await e.getDeleter().deleteMessage(a, a.sender || s);
    } catch (s) {
      this.getLogger().warn(`Could not delete preliminary report analysis ${t}: ${s && s.message || s}`);
    }
  }
  async refreshPreliminaryReportAnalysis(n, s, r, t, a) {
    if (!n || !s || !r || !t || !t.id || !a || !this.isPersonalReportRoom(a)) return;
    const o = this.reportWorkday(), c = ["male", "female", "brow", "manicure"];
    for (const d of c) {
      const m = this.reportAssociation(t.id, d, o), u = await n.getPersistenceReader().readByAssociation(m), I = (u || []).filter((P) => P && P.userId === t.id && P.reportType === d && P.workday === o && P.formData).sort((P, x) => Number(x.updatedAt || 0) - Number(P.updatedAt || 0))[0];
      if (!I || !I.formData) continue;
      const f = this.parseSubmittedReport(I.formData, d);
      if (!f) continue;
      const dueAt = this.reportFinalDueAt(Number(I.firstSubmittedAt || I.updatedAt || Date.now()), o);
      if (Date.now() >= dueAt) {
        await this.deletePreliminaryReportAnalysis(r, n, I.preliminaryMessageId || "");
        await s.removeByAssociation(m);
        await s.createWithAssociation({ ...I, preliminaryMessageId: "", updatedAt: Date.now() }, m);
        return;
      }
      const h = await this.receiptOcrConfig(n), O = await G.confirmedTransferSummaryForUser(n, h, t.id, o), B = await this.mailingProofStatus(n, t, o), L = await this.reportPhotoStatus(n, t, o), w = this.payrollRule(d, f.rows, f.mailings, B), E = await this.sendPreliminaryReportAnalysis(r, n, a, t, O, L, B, w, I.preliminaryMessageId || "", true);
      await s.removeByAssociation(m);
      await s.createWithAssociation({ ...I, preliminaryMessageId: E || "", updatedAt: Date.now() }, m);
      return;
    }
  }
  async sendQueuedReportReminder(e, n, t, s = Date.now()) {
    if (!e || !n || !t || !t.userId || !t.reportType || !t.workday) return t;
    const r = this.reportAssociation(t.userId, t.reportType, t.workday), a = await e.getPersistenceReader().readByAssociation(r), o = (a || []).filter((B) => B && B.userId === t.userId && B.reportType === t.reportType && B.workday === t.workday).sort((B, L) => Number(L.updatedAt || 0) - Number(B.updatedAt || 0))[0];
    if (!o || !o.formData) return { ...t, lastReminderCheckedAt: s, updatedAt: s };
    const c = await e.getUserReader().getById(t.userId), d = o.roomId ? await e.getRoomReader().getById(o.roomId) : void 0, m = o.sourceRoomId ? await e.getRoomReader().getById(o.sourceRoomId) : void 0, u = this.isPersonalReportRoom(d) ? d : this.isPersonalReportRoom(m) ? m : void 0;
    if (!c || !u) return { ...t, lastReminderCheckedAt: s, updatedAt: s };
    const I = this.parseSubmittedReport(o.formData, t.reportType);
    if (!I) return { ...t, lastReminderCheckedAt: s, updatedAt: s };
    const f = await this.receiptOcrConfig(e), h = await G.confirmedTransferSummaryForUser(e, f, t.userId, t.workday), O = await this.mailingProofStatus(e, c, t.workday), P = await this.reportPhotoStatus(e, c, t.workday), x = this.payrollRule(t.reportType, I.rows, I.mailings, O), v = this.preliminaryReportIssues(P, O, x, h);
    if (!v.length) return { ...t, lastReminderCheckedAt: s, updatedAt: s };
    const C = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!C) return { ...t, lastReminderCheckedAt: s, updatedAt: s };
    const A = `⏰ Напоминание по отчёту\nДо 21:00 по Астрахани можно догрузить без вычета.\nНе хватает: ${v.join(", ")}.\nПосле 21:00 будет финальная проверка.`;
    try {
      const B = n.getCreator().startMessage().setSender(C).setRoom(u).setText(A);
      await n.getCreator().finish(B);
      return { ...t, lastReminderAt: s, lastReminderIssues: v, updatedAt: s };
    } catch (B) {
      this.getLogger().warn(`Could not send report reminder: ${B && B.message || B}`);
      return { ...t, lastReminderError: String(B && B.message || B), lastReminderCheckedAt: s, updatedAt: s };
    }
  }
  async removeLegacyPersonalReportMenus(e, n, t) {
    if (!e || !n || !t || !t.id) return 0;
    const s = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!s) return 0;
    let r = 0;
    try {
      const a = await e.getRoomReader().getMessages(t.id, {
        limit: 80,
        skip: 0,
        sort: { createdAt: "desc" },
        showThreadMessages: false
      });
      for (const o of a || []) {
        if (!o || !o.sender || String(o.sender.id || "") !== String(s.id || "")) continue;
        const c = String(o.text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
        const d = c.indexOf("выберите нужный отчет") !== -1 || c.indexOf("заполнить / исправить") !== -1;
        if (!d) continue;
        await n.getDeleter().deleteMessage(o, o.sender);
        r += 1;
      }
    } catch (a) {
      this.getLogger().warn(`Could not remove previous personal report menu: ${a && a.message || a}`);
    }
    return r;
  }
  async refreshPersonalReportButton(e, n, t, s, r, a = false) {
    if (!e || !n || !t || !s || !r || !this.isPersonalReportRoom(s)) return false;
    try {
      const targetUser = await this.masterUserForPersonalReportRoom(e, s, r);
      if (!targetUser) {
        await this.removeLegacyPersonalReportMenus(e, n, s);
        return false;
      }
      await this.rememberPrivateCashRoom(e, t, targetUser, s);
      const o = await this.getReportProfile(e, targetUser.id, s.id);
      if (o) {
        await this.sendPersonalReportLink(e, n, t, s, targetUser, o);
      } else {
        await this.removeLegacyPersonalReportMenus(e, n, s);
        await this.sendReportMenu(e, n, s, targetUser);
      }
      return true;
    } catch (o) {
      this.getLogger().warn(`Could not refresh personal report button: ${o && o.message || o}`);
      return false;
    }
  }
  async refreshKnownPersonalReportRooms(e, n, t) {
    if (!e || !n || !t) return 0;
    let s = 0;
    try {
      const r = await e.getPersistenceReader().readByAssociation(this.privateCashRoomsAssociation());
      for (const a of r || []) {
        if (!a || !a.roomId) continue;
        try {
          const o = await e.getRoomReader().getById(a.roomId);
          if (!o || !this.isPersonalReportRoom(o)) continue;
          let c;
          try {
            c = a.masterUserId ? await e.getUserReader().getById(a.masterUserId) : void 0;
          } catch (_2) {
          }
          c = await this.masterUserForPersonalReportRoom(e, o, c);
          if (!c) continue;
          await this.rememberPrivateCashRoom(e, t, c, o);
          if (await this.refreshPersonalReportButton(e, n, t, o, c, true)) s += 1;
        } catch (o) {
          this.getLogger().warn(`Could not refresh known personal report room ${a.roomId}: ${o && o.message || o}`);
        }
      }
    } catch (r) {
      this.getLogger().warn(`Could not refresh known personal report rooms: ${r && r.message || r}`);
    }
    if (s) this.getLogger().info(`Refreshed ${s} known personal report room button(s)`);
    return s;
  }
  latenessAssociation(e, n) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `lateness:${e}:${n}`
    );
  }
  async latenessEntries(e, n, t) {
    if (!e || !n || !t) return [];
    const s = await e.getPersistenceReader().readByAssociation(this.latenessAssociation(n, t));
    return (s || []).filter((r) => r && r.userId === n && r.workday === t && r.type === "lateness");
  }
  async latenessSummary(e, n, t) {
    const s = await this.latenessEntries(e, n, t);
    return {
      entries: s,
      count: s.length,
      minutes: s.reduce((r, a) => r + Math.max(0, Number(a.minutes) || 0), 0),
      total: s.reduce((r, a) => r + Math.max(0, Number(a.amount) || 0), 0)
    };
  }
  async syncMissingPhotoPenalty(e, n, t, s, r) {
    if (!e || !n || !t || !t.id || !s) return;
    const a = this.latenessAssociation(t.id, s), o = await e.getPersistenceReader().readByAssociation(a), c = (o || []).filter((d) => d && d.userId === t.id && d.workday === s && d.type === "lateness"), d = c.filter((m) => !(m.autoPenalty === true && m.penaltyKind === "missing_photo")), m = d.some((u) => u && u.penaltyKind === "missing_photo"), u = !(r && Number(r.count) > 0);
    if (d.length !== c.length) {
      await n.removeByAssociation(a);
      for (const I of d) await n.createWithAssociation(I, a);
    }
    if (u && !m) {
      await n.createWithAssociation({
        type: "lateness",
        autoPenalty: true,
        penaltyKind: "missing_photo",
        penaltyTitle: "Отсутствие фото в отчёте",
        userId: t.id,
        username: t.username || "",
        userName: t.name || "",
        workday: s,
        minutes: 0,
        amount: 300,
        createdByUserId: "tars",
        createdByUsername: "tars",
        createdAt: Date.now()
      }, a);
    }
  }
  async finalizeSubmittedReportsJob(e, n, t, s, r) {
    if (!n || !t || !r) return;
    const a = this.reportFinalizeQueueAssociation(), o = await n.getPersistenceReader().readByAssociation(a), c = Date.now(), d = [];
    for (const m of o || []) {
      if (!m || m.finalized || !m.userId || !m.reportType || !m.workday || !m.dueAt) {
        if (m) d.push(m);
        continue;
      }
      if (Number(m.dueAt) > c) {
        let u = m;
        if (this.reportReminderDue(m, c)) {
          try {
            u = await this.sendQueuedReportReminder(n, t, m, c);
          } catch (I) {
            this.getLogger().warn(`Could not process report reminder: ${I && I.message || I}`);
            u = { ...m, lastReminderError: String(I && I.message || I), lastReminderCheckedAt: c, updatedAt: c };
          }
        }
        d.push(u);
        continue;
      }
      try {
        const u = this.reportAssociation(m.userId, m.reportType, m.workday), I = await n.getPersistenceReader().readByAssociation(u), f = (I || []).filter((A) => A && A.userId === m.userId && A.reportType === m.reportType && A.workday === m.workday).sort((A, K) => Number(K.updatedAt || 0) - Number(A.updatedAt || 0))[0];
        if (!f || !f.formData) {
          d.push({ ...m, finalized: true, finalizedAt: c, skipped: "missing_report" });
          continue;
        }
        const h = await n.getUserReader().getById(m.userId), storedRoom = f.roomId ? await n.getRoomReader().getById(f.roomId) : void 0, sourceRoom = f.sourceRoomId ? await n.getRoomReader().getById(f.sourceRoomId) : void 0, O = this.isPersonalReportRoom(storedRoom) ? storedRoom : this.isPersonalReportRoom(sourceRoom) ? sourceRoom : void 0, B = f.publicMessageId ? await this.getPublicReportRoom(n) : void 0, L = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
        if (!h || !O) {
          d.push({ ...m, finalized: true, finalizedAt: c, skipped: "missing_user_or_personal_room" });
          continue;
        }
        const w = this.parseSubmittedReport(f.formData, m.reportType);
        if (!w) {
          d.push({ ...m, finalized: true, finalizedAt: c, skipped: "invalid_form" });
          continue;
        }
        const E = await this.receiptOcrConfig(n), C = await G.confirmedTransferSummaryForUser(n, E, m.userId, m.workday), A = await this.mailingProofStatus(n, h, m.workday), K = await this.reportPhotoStatus(n, h, m.workday), M = f.timeCorrection || this.reportTimeCorrection(f.firstSubmittedAt || f.updatedAt || c, f.scheduleStatus || null);
        await this.syncMissingPhotoPenalty(n, r, h, m.workday, K);
        const N = await this.latenessSummary(n, m.userId, m.workday);
        const q = await this.sendReport(t, O, h, w.rows, w.cash, w.transfers, m.reportType, f.messageId || "", C, h, w.mailings, A, M, N, true);
        let ownerSummaryMessageId = await this.sendOwnerShortReport(t, n, h, w.rows, w.cash, w.transfers, m.reportType, f.ownerSummaryMessageId || "", C, w.mailings, A, M, N, true, m.workday);
        let M2 = f.publicMessageId || "";
        if (B && L && M2) {
          try {
            M2 = await this.sendPublicClientSummary(t, B, L, w.rows, h, m.reportType, M2);
          } catch (publicError) {
            this.getLogger().warn(`Could not finalize public summary: ${publicError && publicError.message || publicError}`);
          }
        }
        await r.removeByAssociation(u);
        await r.createWithAssociation({ ...f, roomId: O.id, sourceRoomId: O.id, messageId: q, personalMessageId: "", publicMessageId: M2, ownerSummaryMessageId, finalizedAt: c, finalAnalysis: true, updatedAt: c }, u);
        d.push({ ...m, finalized: true, finalizedAt: c });
      } catch (u) {
        this.getLogger().warn(`Could not finalize submitted report: ${u && u.message || u}`);
        d.push({ ...m, lastError: String(u && u.message || u), lastTriedAt: c });
      }
    }
    await r.removeByAssociation(a);
    for (const m of d.slice(-300)) await r.createWithAssociation(m, a);
  }
  scheduleAssociation(e, n) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `master-schedule:${e}:${n}`
    );
  }
  parseScheduleDate(e) {
    const n = String(e || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(n)) return n;
    const t = /^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?$/.exec(n);
    if (!t) return "";
    let s = Number(t[3] || new Date().getFullYear());
    if (s < 100) s += 2e3;
    const r = Number(t[2]), a = Number(t[1]);
    if (r < 1 || r > 12 || a < 1 || a > 31) return "";
    return `${String(s).padStart(4, "0")}-${String(r).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  displayWorkday(e) {
    const n = String(e || "").split("-");
    return n.length === 3 ? `${n[2]}.${n[1]}.${n[0]}` : String(e || "");
  }
  daysInMonth(e, n) {
    return new Date(e, n, 0).getDate();
  }
  workdayFromParts(e, n, t) {
    return `${String(e).padStart(4, "0")}-${String(n).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
  }
  parseScheduleDays(e, n) {
    const t = /* @__PURE__ */ new Set();
    String(e || "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const r = /^(\d{1,2})[-–—](\d{1,2})$/.exec(s);
      if (r) {
        const a = Number(r[1]), o = Number(r[2]), c = Math.min(a, o), d = Math.max(a, o);
        for (let m = c; m <= d; m += 1) if (m >= 1 && m <= n) t.add(m);
        return;
      }
      const a = Number(s);
      if (a >= 1 && a <= n) t.add(a);
    });
    return Array.from(t).sort((s, r) => s - r);
  }
  parseMonthlyScheduleText(e) {
    const n = String(e || "").replace(/\r/g, "").trim();
    if (!/^график\b/i.test(n)) return null;
    const t = /^график\s+(\d{1,2})[.\-/](\d{2,4})/i.exec(n);
    if (!t) return { ok: false, reason: "month" };
    const s = Number(t[1]);
    let r = Number(t[2]);
    if (r < 100) r += 2e3;
    if (s < 1 || s > 12 || r < 2020 || r > 2100) return { ok: false, reason: "month" };
    const a = this.daysInMonth(r, s), o = n.split("\n").map((d) => d.trim()).filter(Boolean).slice(1), c = [];
    for (const d of o) {
      const m = /^@?([\w.\-а-яё]+)\s*:\s*(.+)$/i.exec(d);
      if (!m) continue;
      const u = String(m[1] || "").replace(/^@/, "").trim(), I = this.parseScheduleDays(m[2], a);
      if (u && I.length) c.push({ username: u, days: I });
    }
    return c.length ? { ok: true, year: r, month: s, daysInMonth: a, entries: c } : { ok: false, reason: "entries" };
  }
  async handleMonthlyScheduleMessage(e, n, t, s) {
    const r = this.parseMonthlyScheduleText(e && e.text);
    if (!r) return false;
    const a = await this.receiptOcrConfig(n), o = String(e.sender && e.sender.username || "").replace(/^@/, "").toLowerCase(), c = ["teimur", "shura", a.ownerUsername, a.adminUsername].map((K) => String(K || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
    if (c.indexOf(o) === -1) {
      await this.replyToScheduleMessage(n, s, e, "🚫 Месячный график может загружать только руководитель или Шура.");
      return true;
    }
    if (!G.isDirectRoom(e && e.room)) {
      await this.replyToScheduleMessage(n, s, e, "График на месяц присылайте Тарсу в личном сообщении.");
      return true;
    }
    if (!r.ok) {
      await this.replyToScheduleMessage(n, s, e, "Формат:\nГРАФИК 09.2026\n@narek: 1,2,3,4,5\n@katya: 2,3,4,5,6\nУказывайте рабочие дни через запятую.");
      return true;
    }
    const d = [], u = [];
    for (const I of r.entries) {
      let f;
      try {
        f = await n.getUserReader().getByUsername(I.username);
      } catch (_2) {
        f = void 0;
      }
      if (!f || !f.id) {
        u.push(`@${I.username}`);
        continue;
      }
      const h = /* @__PURE__ */ new Set(I.days);
      for (let O = 1; O <= r.daysInMonth; O += 1) {
        const P = this.workdayFromParts(r.year, r.month, O), B = this.scheduleAssociation(f.id, P);
        await t.removeByAssociation(B);
        await t.createWithAssociation({
          userId: f.id,
          username: f.username || I.username,
          userName: f.name || "",
          workday: P,
          off: !h.has(O),
          source: "monthly",
          month: `${String(r.month).padStart(2, "0")}.${r.year}`,
          updatedBy: e.sender && (e.sender.username || e.sender.id) || "",
          updatedAt: Date.now()
        }, B);
      }
      d.push(`@${f.username || I.username}: ${I.days.length} рабочих дней`);
    }
    let I = `✅ График ${String(r.month).padStart(2, "0")}.${r.year} принят.\nЗагружено мастеров: ${d.length}.`;
    if (d.length) I += `\n${d.slice(0, 12).join("\n")}${d.length > 12 ? `\n…ещё ${d.length - 12}` : ""}`;
    if (u.length) I += `\n\nНе нашёл пользователей: ${u.join(", ")}. Их график не сохранён.`;
    await this.replyToScheduleMessage(n, s, e, I);
    return true;
  }
  async replyToScheduleMessage(e, n, t, s) {
    const r = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!r || !t || !t.room) return;
    const a = n.getCreator().startMessage().setSender(r).setRoom(t.room).setText(String(s || ""));
    await n.getCreator().finish(a);
  }
  async masterScheduleStatus(e, n, t) {
    if (!n || !n.id) return { off: false };
    const s = await e.getPersistenceReader().readByAssociation(this.scheduleAssociation(n.id, t));
    const r = (s || []).filter((a) => a && a.userId === n.id && a.workday === t).sort((a, o) => Number(o.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    return r || { userId: n.id, workday: t, off: false };
  }
  async shouldExpectReport(e, n, t) {
    const s = await this.masterScheduleStatus(e, n, t);
    return !s.off;
  }
  async handleScheduleCommand(e, n, t, s, r, a = []) {
    if (!e || !n || !t || !r) return;
    const o = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!o) return;
    const c = async (I) => {
      const f = n.getNotifier().getMessageBuilder().setSender(o).setRoom(s).setText(I).getMessage();
      await n.getNotifier().notifyUser(r, f);
    };
    const d = await this.receiptOcrConfig(e), m = String(r.username || "").replace(/^@/, "").toLowerCase(), u = ["teimur", "shura", d.ownerUsername, d.adminUsername].map((I) => String(I || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
    if (u.indexOf(m) === -1) {
      await c("🚫 График может менять только руководитель или Шура.");
      return;
    }
    const I = (a || []).map((P) => String(P || "").trim()).filter(Boolean);
    const f = I.find((P) => /^@?[\w.\-а-яё]+$/i.test(P) && !/^(off|work|on|выходной|рабочий)$/i.test(P));
    const h = I.find((P) => /^(off|выходной)$/i.test(P)) ? "off" : I.find((P) => /^(work|on|рабочий)$/i.test(P)) ? "work" : "";
    const O = I.map((P) => this.parseScheduleDate(P)).find(Boolean) || this.reportWorkday();
    if (!f || !h) {
      await c("Формат: /grafik @логин off [дата] или /grafik @логин work [дата]. Пример: /grafik @narek off 18.08.2026");
      return;
    }
    const P = f.replace(/^@/, "");
    let B;
    try {
      B = await e.getUserReader().getByUsername(P);
    } catch (_2) {
      B = void 0;
    }
    if (!B || !B.id) {
      await c(`Не нашёл мастера @${P}. Проверьте логин.`);
      return;
    }
    const L = this.scheduleAssociation(B.id, O);
    await t.removeByAssociation(L);
    const w = h === "off";
    await t.createWithAssociation({
      userId: B.id,
      username: B.username || P,
      userName: B.name || "",
      workday: O,
      off: w,
      updatedBy: r.username || r.id,
      updatedAt: Date.now()
    }, L);
    await c(w ? `✅ @${B.username || P} отмечен выходным на ${this.displayWorkday(O)}. Тарс не будет ждать отчёт.` : `✅ @${B.username || P} отмечен рабочим на ${this.displayWorkday(O)}. Тарс будет ждать отчёт.`);
  }
  async getGeneralRoom(e) {
    let n = e.getRoomReader();
    return await n.getByName("general") || await n.getByName("General") || await n.getByName("общий") || await n.getByName("Общий") || await n.getByName("gsnv") || await this.getPublicReportRoom(e);
  }
  latenessAmount(e) {
    const n = Math.max(0, Math.floor(Number(e) || 0));
    return Math.min(1e5, 1e3 + n * 100);
  }
  penaltyRules() {
    return [
      { kind: "lunch_late", title: "Опоздание с обеда", amount: 500, words: ["обед", "обеда"] },
      { kind: "lateness", title: "Опоздание", amount: null, words: ["опоздание", "опоздал", "опоздала", "опозд"] },
      { kind: "missing_photo", title: "Отсутствие фото в отчёте", amount: 300, words: ["фото", "фотоотчет", "фотоотчёт", "фотоотчета", "фотоотчёта"] },
      { kind: "absence_notice", title: "Невыход с уважительной причиной без звонка", amount: 500, words: ["уваж", "звонок", "предупред"] },
      { kind: "absence", title: "Невыход на работу", amount: 1e4, words: ["невыход", "прогул"] },
      { kind: "contacts", title: "Обмен контактами с клиентом", amount: 5e3, words: ["контакт", "телефон", "дом"] },
      { kind: "dress_code", title: "Не соблюдение дресс-кода", amount: 500, words: ["форма", "дресс", "дресскод", "dresscode"] },
      { kind: "workspace", title: "Неубранное рабочее место", amount: 500, words: ["место", "кухня", "туалет", "уборка"] },
      { kind: "atmosphere", title: "Не соблюдение audio/TV атмосферы", amount: 500, words: ["audio", "аудио", "tv", "тв", "атмосфера"] },
      { kind: "task", title: "Не выполнение задания", amount: 500, words: ["задание", "просьба", "поручение"] },
      { kind: "schedule_info", title: "Не информирование об изменении графика", amount: 500, words: ["график", "смена"] },
      { kind: "forget", title: "Забывчивость", amount: 500, words: ["забывчивость", "забыл", "забыла"] },
      { kind: "lie", title: "Враньё", amount: 5e3, words: ["вранье", "враньё", "ложь", "обман"] },
      { kind: "coverup", title: "Сокрытие нарушения", amount: 500, words: ["сокрытие", "укрывательство", "скрыл", "скрыла"] },
      { kind: "communication", title: "Некорректное общение / мат", amount: 500, words: ["мат", "общение", "клиентами", "хамство"] },
      { kind: "alcohol_smoke", title: "Курение сигарет / перегар / алкоголь", amount: 5e3, words: ["сигарет", "перегар", "алкоголь"] },
      { kind: "vape", title: "Курение электронных сигарет возле салона", amount: 500, words: ["электрон", "вейп", "vape"] },
      { kind: "reputation", title: "Подрыв имиджа / репутации", amount: 5e3, words: ["имидж", "репутац"] },
      { kind: "duties", title: "Уклонение от обязанностей", amount: 500, words: ["обязанност", "уклонение"] },
      { kind: "subordination", title: "Не соблюдение субординации", amount: 500, words: ["субординац"] },
      { kind: "client_delay", title: "Задержка клиента больше 15 минут", amount: 500, words: ["задержка", "задержал", "задержала"] },
      { kind: "technology", title: "Не соблюдение технологии работ", amount: 500, words: ["технолог"] },
      { kind: "event", title: "Игнорирование корпоративных мероприятий", amount: 500, words: ["мероприят", "корпоратив"] },
      { kind: "client_record", title: "Неправильная запись клиента", amount: 500, words: ["запись"] },
      { kind: "self_service", title: "Оказание себе услуг в рабочее время", amount: 500, words: ["себе", "услуга"] },
      { kind: "fight", title: "Драка / потасовка", amount: 5e3, words: ["драка", "потасовка"] },
      { kind: "personal", title: "Персональный штраф", amount: null, words: ["персональный", "личный"] },
      { kind: "damage", title: "Порча имущества", amount: null, words: ["порча", "имущество"] },
      { kind: "lost_client", title: "Потеря клиента", amount: null, words: ["потеря", "потерял", "потеряла"] }
    ];
  }
  penaltyWordSet() {
    const e = {};
    for (const n of this.penaltyRules()) for (const t of n.words || []) for (const s of String(t).split(/\s+/)) e[this.normalizePersonLookup(s)] = true;
    for (const n of ["руб", "рублей", "р", "мин", "минута", "минут", "минуты", "штраф", "опоздание", "опоздания", "снять", "убрать", "отменить", "отмена", "не", "нет", "с", "в", "за", "по", "код", "отсутствие", "отсутствии", "отчет", "отчёт", "отчета", "отчёта", "рабочее", "рабочего", "клиента", "клиент", "клиентом", "должностных", "неправильная", "неправильный", "несоблюдение", "невыполнение", "неинформирование", "изменение", "корпоративных", "рабочее", "рабочее", "время"]) e[this.normalizePersonLookup(n)] = true;
    return e;
  }
  resolvePenaltyDetails(e, n, t) {
    const s = String(e || "").toLowerCase().replace(/ё/g, "е"), r = this.penaltyRules();
    let a = r.find((o) => (o.words || []).some((c) => s.indexOf(String(c).toLowerCase().replace(/ё/g, "е")) !== -1));
    if (!a) a = r.find((o) => o.kind === "lateness");
    const o = Math.max(0, Math.floor(Number(n) || 0)), c = Math.max(0, Math.floor(Number(t) || 0));
    if (a.kind === "lateness") return { kind: a.kind, title: a.title, minutes: o, amount: this.latenessAmount(o) };
    const d = a.amount === null ? c : c >= 100 ? c : a.amount;
    return { kind: a.kind, title: a.title, minutes: 0, amount: Math.min(1e5, Math.max(0, d || 0)) };
  }
  normalizePersonLookup(e) {
    return String(e || "").toLowerCase().replace(/ё/g, "е").replace(/^@/, "").replace(/[^a-zа-я0-9]+/gi, "");
  }
  personLookupMatches(e, n) {
    const t = this.normalizePersonLookup(n);
    if (!t) return false;
    const s = [e && e.username, e && e.name, e && e.id].map((r) => this.normalizePersonLookup(r)).filter(Boolean);
    return s.some((r) => r === t || r.indexOf(t) !== -1 || t.indexOf(r) !== -1);
  }
  async collectRoomUsers(e, n) {
    const t = {}, s = [];
    for (const r of n || []) {
      if (!r || !r.id) continue;
      try {
        const a = await e.getRoomReader().getMembers(r.id);
        for (const o of a || []) {
          if (!o || !o.id || t[o.id]) continue;
          t[o.id] = true;
          s.push(o);
        }
      } catch (_2) {
      }
    }
    return s;
  }
  async resolveLatenessUser(e, n, t) {
    const s = String(t || "").replace(/^@/, "").trim();
    if (!s) return { user: null, matches: [] };
    try {
      const c = await e.getUserReader().getByUsername(s);
      if (c) return { user: c, matches: [c] };
    } catch (_2) {
    }
    const r = e.getRoomReader(), a = [];
    const o = async (c) => {
      if (!c || !c.id || a.some((d) => d && d.id === c.id)) return;
      a.push(c);
    };
    await o(n);
    for (const c of ["general", "General", "Otchet", "otchet", "cheki-kontrol", "cheki_arhiv", "rasblLki"]) {
      try {
        await o(await r.getByName(c));
      } catch (_2) {
      }
    }
    try {
      await o(await this.getPublicReportRoom(e));
    } catch (_2) {
    }
    const d = (await this.collectRoomUsers(e, a)).filter((c) => this.personLookupMatches(c, s));
    const exact = d.filter((c) => [c && c.username, c && c.name].map((m) => this.normalizePersonLookup(m)).indexOf(this.normalizePersonLookup(s)) !== -1);
    const m = exact.length ? exact : d;
    return { user: m.length === 1 ? m[0] : null, matches: m.slice(0, 8) };
  }
  parseLatenessText(e) {
    const n = String(e || "").trim();
    if (!n) return null;
    const t = n.toLowerCase().replace(/ё/g, "е"), commandStart = /^(опоздани[ея]|штраф)(?:\s|$)/i, clearStart = /^(снять|убрать|отменить)\s+(опоздание|штраф)(?:\s|$)/i, clearWord = /(^|\s)(снять|убрать|отменить|отмена)(\s|$)/i, s = clearStart.test(t) || commandStart.test(t) && clearWord.test(t);
    if (!commandStart.test(t) && !s) return null;
    let r = n.replace(/^(опоздани[ея]|штраф)(?:\s+|$)/i, "").replace(/^(снять|убрать|отменить)\s+(опоздание|штраф)(?:\s+|$)/i, "");
    const a = r.split(/\s+/).filter(Boolean), o = a.map((d) => this.parseScheduleDate(d)).find(Boolean) || this.reportWorkday(), c = a.find((d) => /^\d+$/.test(d)), d = this.penaltyWordSet();
    r = a.filter((m) => !this.parseScheduleDate(m) && !/^\d+$/.test(m) && !d[this.normalizePersonLookup(m)]).join(" ").trim();
    return { query: r, minutes: c ? Number(c) : 0, workday: o, clearPenalty: s, penalty: this.resolvePenaltyDetails(n, c ? Number(c) : 0, c ? Number(c) : 0) };
  }
  async getOrCreateDirectRoom(e, n, t, s) {
    if (!e || !n || !t || !s || !t.username || !s.username) return null;
    const r = [s.username].filter(Boolean);
    try {
      const a = await e.getRoomReader().getDirectByUsernames(r);
      if (a) return a;
    } catch (a) {
      this.getLogger().warn(`Could not find direct room for ${r.join(",")}: ${a && a.message || a}`);
    }
    try {
      const a = n.getCreator().startRoom().setCreator(t).setType(Y.RoomType.DIRECT_MESSAGE).setMembersToBeAddedByUsernames(r), o = await n.getCreator().finish(a);
      return await e.getRoomReader().getById(o);
    } catch (a) {
      this.getLogger().warn(`Could not create direct room for ${r.join(",")}: ${a && a.message || a}`);
      return null;
    }
  }
  splitPrivateChatUsernames(e) {
    const n = {}, t = [];
    for (const s of String(e || "").split(/[\s,;]+/)) {
      const r = String(s || "").replace(/^@/, "").split(":")[0].trim();
      if (!r || n[r.toLowerCase()]) continue;
      n[r.toLowerCase()] = true;
      t.push(r);
    }
    return t;
  }
  normalizeUserSearchToken(e) {
    return String(e || "").replace(/^@/, "").replace(/ё/g, "е").toLowerCase().replace(/[^a-z0-9а-я_-]+/g, "");
  }
  async resolvePrivateChatUser(e, n, t) {
    const s = String(t || "").replace(/^@/, "").trim();
    if (!s) return null;
    try {
      const r = await e.getUserReader().getByUsername(s);
      if (r && r.username) return r;
    } catch (_2) {
    }
    const r = this.normalizeUserSearchToken(s);
    if (!r || !n || !n.id) return null;
    try {
      const a = await e.getRoomReader().getMembers(n.id);
      for (const o of a || []) {
        const c = this.normalizeUserSearchToken(o && o.username), d = this.normalizeUserSearchToken(o && o.name);
        if (c === r || d === r) return o;
      }
      for (const o of a || []) {
        const c = this.normalizeUserSearchToken(o && o.username), d = this.normalizeUserSearchToken(o && o.name);
        if (c && c.indexOf(r) !== -1 || d && d.indexOf(r) !== -1) return o;
      }
    } catch (_3) {
    }
    return null;
  }
  normalizePrivateChatRoomName(e, n) {
    const t = String(e || "tars-").trim() || "tars-", s = String(n || "").replace(/^@/, "").trim().toLowerCase();
    return `${t}${s}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `tars-${s}`;
  }
  isMasterPrivateReportRoom(e) {
    const n = String(e && (e.slugifiedName || e.name || "") || "").toLowerCase();
    return !G.isDirectRoom(e) && n.indexOf("tars-") === 0;
  }
  isPersonalReportRoom(e) {
    return this.isMasterPrivateReportRoom(e);
  }
  isOwnPersonalReportRoom(e, n) {
    const t = String(e && (e.slugifiedName || e.name || "") || "").toLowerCase(), s = String(n && n.username || "").replace(/^@/, "").trim().toLowerCase();
    return Boolean(s && t.indexOf(`tars-${s}`) === 0);
  }
  personalReportUsernameFromRoom(e) {
    const n = String(e && (e.slugifiedName || e.name || e.displayName || "") || "").toLowerCase().trim();
    const t = /^tars-([a-z0-9_-]+)/.exec(n);
    return t && t[1] ? t[1].replace(/^-+|-+$/g, "") : "";
  }
  async masterUserForPersonalReportRoom(e, n, t) {
    if (!n || !this.isPersonalReportRoom(n)) return t;
    const s = this.personalReportUsernameFromRoom(n);
    if (s) {
      try {
        const r = await e.getUserReader().getByUsername(s);
        if (r) return r;
      } catch (_2) {
      }
    }
    if (t && this.isOwnPersonalReportRoom(n, t)) return t;
    try {
      const r = await e.getRoomReader().getMembers(n.id);
      const a = (r || []).filter((o) => {
        const c = String(o && o.username || "").replace(/^@/, "").trim().toLowerCase();
        return c && c !== "tars" && c !== "teimur" && c !== "shura";
      });
      if (a.length === 1) return a[0];
    } catch (_2) {
    }
    return void 0;
  }
  isReportRequestText(e) {
    const n = String(e || "").trim().toLowerCase().replace(/ё/g, "е");
    return /^(?:\/)?(?:отчет|otchet|report)$/.test(n);
  }
  parseMasterChatText(e) {
    const n = String(e || "").trim();
    if (!n) return null;
    const t = n.toLowerCase().replace(/ё/g, "е");
    const r = n.match(/^\/?tarschat(?:\s+(.+))?$/i);
    if (r) {
      const a = String(r[1] || "").trim(), o = a.toLowerCase().replace(/ё/g, "е");
      if (!a || o === "all" || o === "все" || o === "создать") return { all: true, usernames: [] };
      return { all: false, usernames: this.splitPrivateChatUsernames(a) };
    }
    if (/^(?:tars\s+)?(?:чаты\s+мастеров|создать\s+чаты\s+мастеров|создай\s+чаты\s+мастеров)$/i.test(t)) return { all: true, usernames: [] };
    const s = n.match(/^(?:tars\s+)?(?:чат\s+мастера?|создать\s+чат\s+мастера?)\s+(.+)$/i);
    if (!s) return null;
    return { all: false, usernames: this.splitPrivateChatUsernames(s[1]) };
  }
  async ensureMasterPrivateChat(e, n, t, s, r, a) {
    if (!e || !n || !t || !s || !s.username) return { status: "failed", username: s && s.username || "" };
    const o = this.normalizePrivateChatRoomName(a, s.username), c = [s.username].concat(r || []).map((m) => String(m || "").replace(/^@/, "").trim()).filter(Boolean).filter((m, u, I) => I.indexOf(m) === u);
    let d;
    try {
      d = await e.getRoomReader().getByName(o);
    } catch (_2) {
      d = void 0;
    }
    if (!d) {
      const m = [];
      for (const u of c) {
        try {
          const I = await e.getUserReader().getByUsername(u);
          if (I && I.username) m.push(I.username);
        } catch (_3) {
        }
      }
      const u = n.getCreator().startRoom().setCreator(t).setType(Y.RoomType.PRIVATE_GROUP).setSlugifiedName(o).setDisplayName(`TARS — ${s.name || s.username}`).setReadOnly(false).setDisplayingOfSystemMessages(false).setMembersToBeAddedByUsernames(m);
      const I = await n.getCreator().finish(u);
      d = await e.getRoomReader().getById(I);
      if (!d) return { status: "failed", username: s.username, roomName: o };
    }
    try {
      const m = await e.getRoomReader().getMembers(d.id), u = new Set((m || []).map((w) => String(w && w.id || ""))), I = await n.getExtender().extendRoom(d.id, t);
      let f = false, h = 0;
      if (!u.has(String(t.id || ""))) {
        I.addMember(t);
        f = true;
        h++;
      }
      for (const w of c) {
        try {
          const E = await e.getUserReader().getByUsername(w);
          if (E && !u.has(String(E.id || ""))) {
            I.addMember(E);
            f = true;
            h++;
          }
        } catch (_4) {
        }
      }
      if (f) await n.getExtender().finish(I);
      return { status: "ok", username: s.username, roomId: d.id, roomName: o, displayName: d.displayName || d.slugifiedName || o, added: h };
    } catch (m) {
      this.getLogger().warn(`Could not refresh master private chat ${o}: ${m && m.message || m}`);
      return { status: "ok", username: s.username, roomId: d.id, roomName: o, displayName: d.displayName || d.slugifiedName || o, added: 0 };
    }
  }
  async handleMasterChatCommand(e, n, t, s, r, a = []) {
    if (!e || !n || !r) return;
    const o = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!o) return;
    const c = async (P) => {
      const B = n.getNotifier().getMessageBuilder().setSender(o).setRoom(s).setText(String(P || "")).getMessage();
      await n.getNotifier().notifyUser(r, B);
    };
    const d = await this.receiptOcrConfig(e), m = String(r.username || "").replace(/^@/, "").toLowerCase(), u = ["teimur", "shura", d.ownerUsername, d.adminUsername].map((P) => String(P || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
    if (u.indexOf(m) === -1) {
      await c("🚫 Создавать личные чаты мастеров может только руководитель или Шура.");
      return;
    }
    const I = (a || []).map((P) => String(P || "").trim()).filter(Boolean), f = I.map((P) => P.toLowerCase().replace(/ё/g, "е")), h = !I.length || f.indexOf("all") !== -1 || f.indexOf("все") !== -1 || f.indexOf("создать") !== -1, O = String(await e.getEnvironmentReader().getSettings().getValueById("master_private_chat_usernames") || ""), B = String(await e.getEnvironmentReader().getSettings().getValueById("master_private_chat_prefix") || "tars-");
    let L = h ? this.splitPrivateChatUsernames(O) : this.splitPrivateChatUsernames(I.join(" "));
    if (!L.length) {
      await c("Формат: /tarschat @логин или /tarschat all.\nДля all заполните настройку «Логины мастеров для личных чатов» через запятую.");
      return;
    }
    const w = [], E = [];
    for (const P of L) {
      try {
        const K = await this.resolvePrivateChatUser(e, s, P);
        if (!K || !K.username) {
          E.push(P);
          continue;
        }
        const M = await this.ensureMasterPrivateChat(e, n, o, K, u, B);
        if (M.status === "ok") {
          w.push(`@${K.username}: #${M.roomName}`);
          try {
            const N = M.roomId ? await e.getRoomReader().getById(M.roomId) : M.roomName ? await e.getRoomReader().getByName(M.roomName) : void 0;
            if (N) {
              await this.rememberPrivateCashRoom(e, t, K, N);
              const z = await this.getReportProfile(e, K.id, N.id);
              if (z) await this.sendPersonalReportLink(e, n, t, N, K, z);
              else await this.sendReportMenu(e, n, N, K);
            }
          } catch (N) {
            this.getLogger().warn(`Could not refresh report button for ${P}: ${N && N.message || N}`);
          }
        } else E.push(P);
      } catch (K) {
        this.getLogger().warn(`Could not create master private chat for ${P}: ${K && K.message || K}`);
        E.push(P);
      }
    }
    let C = `✅ Личные чаты TARS проверены.\nГотово: ${w.length}.`;
    if (w.length) C += `\n${w.slice(0, 20).join("\n")}${w.length > 20 ? `\n…ещё ${w.length - 20}` : ""}`;
    if (E.length) C += `\n\nНе нашёл или не создал: ${E.join(", ")}. Из лички пишите точные логины. По имени ищу только среди участников текущего чата.`;
    await c(C);
  }
  async handleMasterChatTextMessage(e, n, t, s) {
    const r = this.parseMasterChatText(e && e.text);
    if (!r) return false;
    const a = r.all ? ["all"] : r.usernames;
    await this.handleMasterChatCommand(n, t, s, e.room, e.sender, a);
    return true;
  }
  async handleLatenessCommand(e, n, t, s, r, a = []) {
    if (!e || !n || !t || !s || !r) return;
    const o = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!o) return;
    const c = async (M) => {
      const N = n.getNotifier().getMessageBuilder().setSender(o).setRoom(s).setText(String(M || "")).getMessage();
      await n.getNotifier().notifyUser(r, N);
    };
    const sendRoom = async (M, N, z = o) => {
      if (!N || !z) return;
      const latest = n.getCreator().startMessage().setSender(z).setRoom(N).setText(String(M || ""));
      await n.getCreator().finish(latest);
    };
    const d = await this.receiptOcrConfig(e), m = String(r.username || "").replace(/^@/, "").toLowerCase(), u = ["teimur", "shura", d.ownerUsername, d.adminUsername].map((M) => String(M || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
    if (u.indexOf(m) === -1) {
      await c("🚫 Штраф может фиксировать только руководитель или Шура.");
      return;
    }
    const I = (a || []).map((M) => String(M || "").trim()).filter(Boolean), f = I.find((M) => /^@?[\w.\-а-яё]+$/i.test(M) && !/^\d+$/.test(M) && !/^(clear|reset|remove|delete|снять|удалить|отмена)$/i.test(M)), h = I.filter((M) => /^\d+$/.test(M)).map((M) => Number(M)).find((M) => Number.isInteger(M) && M > 0), O = I.map((M) => this.parseScheduleDate(M)).find(Boolean) || this.reportWorkday(), clearPenalty = I.some((M) => /^(0|clear|reset|remove|delete|снять|удалить|отмена)$/i.test(M));
    if (!f) {
      await c("Формат: /shtraf @логин тип [минуты/сумма] [дата]. Пример: /shtraf @narek опоздание 12. Снять штрафы: /shtraf @narek 0");
      return;
    }
    return await this.processLateness(e, n, t, s, r, f.replace(/^@/, ""), h || 0, O, clearPenalty, c, sendRoom, o, this.resolvePenaltyDetails(I.join(" "), h || 0, h || 0));
  }
  async handleLatenessTextMessage(e, n, t, s) {
    const r = this.parseLatenessText(e && e.text);
    if (!r) return false;
    const a = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser();
    if (!a || !e || !e.sender || !e.room) return true;
    const o = async (P) => {
      const B = t.getNotifier().getMessageBuilder().setSender(a).setRoom(e.room).setText(String(P || "")).getMessage();
      await t.getNotifier().notifyUser(e.sender, B);
    };
    const c = async (P, B, L = a) => {
      if (!B || !L) return;
      const w = t.getCreator().startMessage().setSender(L).setRoom(B).setText(String(P || ""));
      await t.getCreator().finish(w);
    };
    if (!r.query) {
      await o("Формат: Штраф Дарья 5. Другой вид: Штраф Дарья форма. Снять: Снять штраф Дарья.");
      return true;
    }
    await this.processLateness(n, t, s, e.room, e.sender, r.query, r.minutes, r.workday, r.clearPenalty, o, c, a, r.penalty);
    return true;
  }
  async processLateness(e, n, t, s, r, a, o, c, d, m, u, I, f2 = null) {
    const config = await this.receiptOcrConfig(e), f = String(r.username || "").replace(/^@/, "").toLowerCase(), h = ["teimur", "shura", config.ownerUsername, config.adminUsername].map((M) => String(M || "").replace(/^@/, "").toLowerCase()).filter(Boolean);
    if (h.indexOf(f) === -1) {
      await m("🚫 Штраф может фиксировать только руководитель или Шура.");
      return;
    }
    const O = await this.resolveLatenessUser(e, s, a);
    const B = O.user, P = String(a || "").replace(/^@/, "");
    if (!B || !B.id) {
      const M = (O.matches || []).map((N) => `@${N.username || N.name || N.id}`).join(", ");
      await m(M ? `Нашёл несколько сотрудников: ${M}. Напишите точный логин.` : `Не нашёл сотрудника «${P}». Напишите точный логин или имя как в чате.`);
      return;
    }
    if (d) {
      await t.removeByAssociation(this.latenessAssociation(B.id, c));
      await m(`✅ Штрафы сняты\nСотрудник: @${B.username || P}\nДата: ${this.displayWorkday(c)}`);
      return;
    }
    const penalty = f2 || this.resolvePenaltyDetails("", o, o), L = Math.max(0, Number(penalty.amount) || 0), w = this.latenessAssociation(B.id, c), E = {
      type: "lateness",
      penaltyKind: penalty.kind || "lateness",
      penaltyTitle: penalty.title || "Опоздание",
      userId: B.id,
      username: B.username || P,
      userName: B.name || "",
      workday: c,
      minutes: Math.max(0, Number(penalty.minutes) || 0),
      amount: L,
      createdByUserId: r.id,
      createdByUsername: r.username || "",
      createdAt: Date.now()
    };
    if (L <= 0) {
      await m("Не понял сумму штрафа. Для персонального штрафа укажите сумму: Штраф Дарья персональный 1500.");
      return;
    }
    await t.createWithAssociation(E, w);
    const C = await this.latenessSummary(e, B.id, c), A = this.formatRubles(L), K = this.formatRubles(C.total);
    await m(`✅ Штраф зафиксирован\nСотрудник: @${B.username || P}\nТип: ${penalty.title || "Штраф"}\nДата: ${this.displayWorkday(c)}${E.minutes ? `\nМинут: ${E.minutes}` : ""}\nШтраф: ${A}\nВсего штрафов за день: ${K}\nВнёс: @${r.username || r.id}`);
    const directRoom = await this.getOrCreateDirectRoom(e, n, I, B);
    if (directRoom) {
      try {
        await u(`⚠️ Зафиксирован штраф ${this.displayWorkday(c)}.\nТип: ${penalty.title || "Штраф"}${E.minutes ? `\nМинут: ${E.minutes}` : ""}\nСумма: ${A}.\nБудет вычтено из отчёта за день.`, directRoom, I);
      } catch (M) {
        this.getLogger().warn(`Could not notify penalized user ${B.username || P}: ${M && M.message || M}`);
      }
    }
  }
  reportButtonAssociation(e, n) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `report-button:${e}:${n}`
    );
  }
  cashLauncherAssociation() {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      "cash-report-launcher:v1"
    );
  }
  reportWorkday(e = new Date()) {
    e = new Date(e.getTime() - 4 * 60 * 60 * 1e3);
    let n = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Astrakhan",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(e), t = (s) => {
      let r = n.find((a) => a.type === s);
      return r ? r.value : "";
    };
    return `${t("year")}-${t("month")}-${t("day")}`;
  }
  reportLocalHour(e = new Date()) {
    const n = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Astrakhan",
      hour: "2-digit",
      hour12: false
    }).formatToParts(e), t = n.find((s) => s.type === "hour");
    return Number(t && t.value || 0) % 24;
  }
  reportLocalMinutes(e = new Date()) {
    const n = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Astrakhan",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(e), t = (s) => {
      const r = n.find((a) => a.type === s);
      return Number(r && r.value || 0);
    };
    return t("hour") % 24 * 60 + t("minute");
  }
  reportSubmittedAfterDeadline(e = Date.now()) {
    const n = this.reportLocalMinutes(new Date(e));
    return n > 21 * 60 || n < 4 * 60;
  }
  reportSubmittedAfterWarningStart(e = Date.now()) {
    const n = this.reportLocalMinutes(new Date(e));
    return n >= 20 * 60 + 15 || n < 4 * 60;
  }
  reportTimeCorrection(e, n = null) {
    if (n && n.off) {
      return {
        firstSubmittedAt: Number(e || Date.now()),
        deadline: "21:00",
        amount: 0,
        applied: false,
        warning: false,
        label: "выходной",
        offday: true
      };
    }
    const s = Number(e || Date.now()), t = this.reportSubmittedAfterDeadline(s), r = this.reportSubmittedAfterWarningStart(s);
    return {
      firstSubmittedAt: s,
      deadline: "21:00",
      amount: t ? 300 : 0,
      applied: t,
      warning: r,
      label: t ? "😔 опоздание после 21:00" : r ? "⚠️ после 20:15, без вычета до 21:00" : "👍 вовремя до 21:00"
    };
  }
  hasImageMessage(e) {
    const n = [];
    if (e && e.file) n.push(e.file);
    if (e && Array.isArray(e.files)) n.push(...e.files);
    return n.some((t) => t && /^image\//i.test(String(t.type || "")));
  }
  async getMailingProofRoom(e) {
    const n = e.getRoomReader(), t = ["rasblLki", "rasbllki", "rassylki", "rasylki", "рассылки", "Рассылки"];
    for (const s of t) {
      try {
        const r = await n.getByName(s);
        if (r && r.id) return r;
      } catch (_2) {
      }
    }
    return void 0;
  }
  proofMessageText(e) {
    return G.messageDescriptorText(e).toLowerCase().replace(/ё/g, "е");
  }
  isMailingProofMessage(e) {
    return this.hasImageMessage(e) && (/рассыл|rassyl|rasbl|mailing|broadcast/.test(this.proofMessageText(e)) || G.looksLikeMailingProofText(this.proofMessageText(e)));
  }
  messageMentionsUser(e, n) {
    if (!e || !n) return false;
    const t = this.proofMessageText(e), s = [
      n.username ? `@${String(n.username).toLowerCase()}` : "",
      n.username,
      n.name
    ].filter(Boolean).map((r) => String(r).toLowerCase().replace(/ё/g, "е"));
    return s.some((r) => r && t.indexOf(r) !== -1);
  }
  async privateCashRoomsForUser(e, n) {
    if (!e || !n || !n.id) return [];
    const t = [], s = (r) => {
      if (!r || !r.id || !this.isPersonalReportRoom(r) || t.some((a) => a && a.id === r.id)) return;
      t.push(r);
    };
    try {
      const r = await e.getPersistenceReader().readByAssociation(this.privateCashRoomsAssociation());
      for (const a of r || []) {
        if (!a || String(a.masterUserId || "") !== String(n.id) || !a.roomId) continue;
        try {
          s(await e.getRoomReader().getById(a.roomId));
        } catch (_2) {
        }
      }
    } catch (_2) {
    }
    return t;
  }
  mailingProofIndexAssociation(e) {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      `mailing-proof-index:${e}`
    );
  }
  async mailingProofStatus(e, n, t) {
    if (!e || !n || !n.id) return { roomFound: false, count: 0 };
    const s = [], r = (a, o = false) => {
      if (!a || !a.id || s.some((c) => c && c.room && c.room.id === a.id)) return;
      s.push({ room: a, direct: o });
    };
    r(await this.getMailingProofRoom(e), false);
    for (const a of await this.privateCashRoomsForUser(e, n)) r(a, true);
    if (!s.length) return { roomFound: false, count: 0 };
    let a = 0;
    const o = {};
    try {
      const c = await e.getPersistenceReader().readByAssociation(this.mailingProofIndexAssociation(t || this.reportWorkday()));
      for (const d of c || []) {
        if (!d || String(d.userId || "") !== String(n.id) || t && String(d.workday || "") !== String(t)) continue;
        const m = String(d.uploadId || d.roomId + ":" + d.createdAt || "");
        if (!m || o[m]) continue;
        o[m] = true;
        a += 1;
      }
    } catch (_2) {
    }
    for (const c of s) {
      for (let d = 0; d < 3; d += 1) {
        const m = await e.getRoomReader().getMessages(c.room.id, {
          limit: 100,
          skip: d * 100,
          sort: { createdAt: "desc" },
          showThreadMessages: false
        });
        if (!m || !m.length) break;
        for (const u of m) {
          const I = u && u.createdAt ? this.reportWorkday(new Date(u.createdAt)) : "";
          if (t && I && I !== t) continue;
          if (t && I && I < t) continue;
          if (!u || !u.sender || u.sender.id !== n.id || !this.hasImageMessage(u)) continue;
          if (c.direct && !this.isMailingProofMessage(u)) continue;
          const h = String(u.id || `${c.room.id}:${u.createdAt || ""}`);
          if (o[h]) continue;
          o[h] = true;
          a += 1;
        }
        if (m.length < 100) break;
      }
    }
    return { roomFound: true, roomId: s[0].room.id, count: a };
  }
  async reportPhotoStatus(e, n, t) {
    if (!e || !n || !n.id) return { roomFound: false, count: 0 };
    const r = [], a = (o, c = false) => {
      if (!o || !o.id || r.some((d) => d && d.room && d.room.id === o.id)) return;
      r.push({ room: o, direct: c });
    };
    a(await this.getPublicReportRoom(e), false);
    for (const o of await this.privateCashRoomsForUser(e, n)) a(o, true);
    if (!r.length) return { roomFound: false, count: 0 };
    let o = 0;
    const c = {};
    for (const d of r) {
      for (let m = 0; m < 3; m += 1) {
        const u = await e.getRoomReader().getMessages(d.room.id, {
          limit: 100,
          skip: m * 100,
          sort: { createdAt: "desc" },
          showThreadMessages: false
        });
        if (!u || !u.length) break;
        for (const I of u) {
          const f = I && I.createdAt ? this.reportWorkday(new Date(I.createdAt)) : "";
          if (t && f && f !== t) continue;
          if (t && f && f < t) continue;
          if (!I || !this.hasImageMessage(I)) continue;
          if (d.direct) {
            if (!I.sender || String(I.sender.id || "") !== String(n.id)) continue;
            if (this.isMailingProofMessage(I) || G.directFileIntent(I) === "mailing" || G.directFileIntent(I) === "receipt") continue;
          } else if (!(I.sender && String(I.sender.id || "") === String(n.id) || this.messageMentionsUser(I, n))) continue;
          const h = String(I.id || `${d.room.id}:${I.createdAt || ""}`);
          if (h && c[h]) continue;
          if (h) c[h] = true;
          o += 1;
        }
        if (u.length < 100) break;
      }
    }
    return { roomFound: true, roomId: r[0].room.id, count: o };
  }
  async getReportProfile(e, n, t = "") {
    const s = ["male", "female", "brow", "manicure"];
    let allowUserProfileFallback = true;
    if (t) {
      let roomProfiles = await e.getPersistenceReader().readByAssociation(this.roomProfileAssociation(t)), roomProfile = (roomProfiles || []).filter((o) => o && o.roomId === t && s.indexOf(o.reportType) !== -1).sort((o, c) => Number(c.updatedAt || c.createdAt || 0) - Number(o.updatedAt || o.createdAt || 0))[0];
      if (roomProfile) return roomProfile.reportType;
      let o = await e.getPersistenceReader().readByAssociation(this.reportButtonAssociation(n, t)), c = (o || []).filter((d) => d && d.roomId === t && s.indexOf(d.reportType) !== -1).sort((d, m) => Number(m.createdAt || 0) - Number(d.createdAt || 0))[0];
      if (c) return c.reportType;
      try {
        const d = await e.getRoomReader().getById(t), m = n ? await e.getUserReader().getById(n) : void 0, u = String(m && m.username || "").replace(/^@/, "").trim().toLowerCase();
        if (u === "teimur" && !this.isOwnPersonalReportRoom(d, m)) allowUserProfileFallback = false;
      } catch (_2) {
      }
    }
    if (!allowUserProfileFallback) return void 0;
    let r = await e.getPersistenceReader().readByAssociation(this.profileAssociation(n)), a = (r || []).filter((o) => o && o.userId === n && s.indexOf(o.reportType) !== -1).sort((o, c) => Number(c.updatedAt || c.createdAt || 0) - Number(o.updatedAt || o.createdAt || 0))[0];
    if (a) return a.reportType;
    return void 0;
  }
  privateCashRoomsAssociation() {
    return new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      "private-cash-rooms:v1"
    );
  }
  async rememberPrivateCashRoom(e, n, t, s) {
    if (!e || !n || !t || !s || !s.id) return;
    let r = this.privateCashRoomsAssociation(), a = await e.getPersistenceReader().readByAssociation(r);
    const o = (a || []).filter((c) => c && c.roomId !== s.id);
    if (o.length !== (a || []).length) {
      await n.removeByAssociation(r);
      for (const c of o) await n.createWithAssociation(c, r);
    }
    await n.createWithAssociation({ roomId: s.id, masterUserId: t.id, username: t.username || "", updatedAt: Date.now() }, r);
  }
  async archivePersonalRoomsAtNoonJob(e, n, t, s, r) {
    if (!r) return 0;
    const config = await this.receiptOcrConfig(n);
    if (!G.personalChatCleanupReady(Date.now(), config)) return 0;
    const association = this.privateCashRoomsAssociation();
    const records = await n.getPersistenceReader().readByAssociation(association);
    let archivedAndDeleted = 0;
    const seenRooms = {};
    for (const record of records || []) {
      if (!record || !record.roomId || seenRooms[record.roomId]) continue;
      seenRooms[record.roomId] = true;
      try {
        const room = await n.getRoomReader().getById(record.roomId);
        if (!room) continue;
        archivedAndDeleted += await G.archiveAndCleanupPersonalRoomAtNoon(room, n, r, t, config, this.getLogger());
      } catch (error) {
        this.getLogger().warn(`Could not archive/clear personal room ${record.roomId} at noon: ${error && error.message || error}`);
      }
    }
    if (archivedAndDeleted) this.getLogger().info(`Noon personal cleanup archived and deleted ${archivedAndDeleted} message(s)`);
    return archivedAndDeleted;
  }
  async cleanupPrivateCashRoomsJob(e, n, t, s, r) {
    let association = new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      "private-cash-rooms:v1"
    ), records = await n.getPersistenceReader().readByAssociation(association), a = 0, config = await this.receiptOcrConfig(n);
    for (let o of records || []) {
      if (!o || !o.roomId) continue;
      try {
        let c = await n.getRoomReader().getById(o.roomId);
        if (c) {
          a += await G.cleanupExpiredMasterRoom(c, void 0, n, t, config, this.getLogger());
          if (config.archiveEnabled && r) a += await G.cleanupArchivedReceiptMessages(c, n, r, t, this.getLogger(), config);
        }
      } catch (c) {
        this.getLogger().warn(`Could not clean private cash room ${o.roomId}: ${c && c.message || c}`);
      }
    }
    if (config.archiveEnabled && r) {
      try {
        a += await G.cleanupExpiredReceiptArchive(n, r, t, this.getLogger());
      } catch (cleanupError) {
        this.getLogger().warn(`Could not clean archived receipt metadata: ${cleanupError && cleanupError.message || cleanupError}`);
      }
    }
    if (a) this.getLogger().info(`Deleted ${a} archived/private messages older than 24 hours`);
  }
  async forwardPendingReportPhotosJob(e, n, t, s, r) {
    try {
      const config = await this.receiptOcrConfig(n);
      const count = await G.publishPendingReportPhotos(n, r, t, this.getLogger(), s, config);
      if (count) this.getLogger().info(`Forwarded ${count} queued report photo(s) to Otchet`);
      return count;
    } catch (error) {
      this.getLogger().warn(`Could not process pending report photos: ${error && error.message || error}`);
      return 0;
    }
  }
  async selectReportProfile(e, n, t, s, r, a) {
    let c = s;
    if (c && this.isPersonalReportRoom(c)) {
      const targetUser = await this.masterUserForPersonalReportRoom(e, c, r);
      if (!targetUser) {
        await this.removeLegacyPersonalReportMenus(e, n, c);
        return;
      }
      const d = this.roomProfileAssociation(c.id);
      await t.removeByAssociation(d);
      await t.createWithAssociation({ roomId: c.id, userId: targetUser.id, username: targetUser.username || "", reportType: a, updatedAt: Date.now() }, d);
      if (this.isOwnPersonalReportRoom(c, targetUser)) {
        let o = this.profileAssociation(targetUser.id);
        await t.removeByAssociation(o);
        await t.createWithAssociation({ userId: targetUser.id, username: targetUser.username || "", reportType: a, updatedAt: Date.now() }, o);
      }
      await this.rememberPrivateCashRoom(e, t, targetUser, c);
      await this.removeLegacyPersonalReportMenus(e, n, c);
      r = targetUser;
    } else {
      let o = this.profileAssociation(r.id);
      await t.removeByAssociation(o);
      await t.createWithAssociation({ userId: r.id, username: r.username || "", reportType: a, updatedAt: Date.now() }, o);
    }
    if (c) await this.sendPersonalReportLink(e, n, t, c, r, a);
  }
  async ensureMasterCashRoom(e, n, t, s) {
    if (!e || !s || !s.id) return;
    return (await this.privateCashRoomsForUser(e, s))[0];
  }
  async handleReportCommand(e, n, t, s, r, a = false) {
    if (!s || !r) return;
    let h = s;
    if (!h || !this.isPersonalReportRoom(h)) {
      let i = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
      if (i && s && r) {
        let p = n.getNotifier(), x = p.getMessageBuilder().setSender(i).setRoom(s).setText("Отчёт теперь работает только в личном чате TARS мастера. Откройте #tars-логин и нажмите «Заполнить отчёт».").getMessage();
        await p.notifyUser(r, x);
      }
      return;
    }
    const targetUser = await this.masterUserForPersonalReportRoom(e, h, r);
    if (!targetUser) {
      await this.removeLegacyPersonalReportMenus(e, n, h);
      return;
    }
    await this.rememberPrivateCashRoom(e, t, targetUser, h);
    if (a) return await this.sendReportMenu(e, n, h, targetUser);
    const o = await this.getReportProfile(e, targetUser.id, h.id);
    if (o) return await this.refreshPersonalReportButton(e, n, t, h, targetUser);
    return await this.sendReportMenu(e, n, h, targetUser);
  }
  async ensureCashRoomName(e, n) {
    return false;
  }
  async getCashReportRoom(e) {
    return void 0;
  }
  async refreshCashReportLauncher(e, n, t) {
    return false;
  }
  async getPublicReportRoom(e) {
    let n = e.getRoomReader();
    return await n.getByName("Otchet") || await n.getByName("otchet") || await n.getByName("\u041E\u0442\u0447\u0435\u0442") || await n.getByName("\u043E\u0442\u0447\u0435\u0442") || await n.getByName("\u041E\u0442\u0447\u0451\u0442") || await n.getByName("\u043E\u0442\u0447\u0451\u0442") || await n.getByName("\u041E\u0442\u0447\u0435\u0442\u044b") || await n.getByName("\u043E\u0442\u0447\u0435\u0442\u044b") || await n.getByName("\u041E\u0442\u0447\u0451\u0442\u044b") || await n.getByName("\u043E\u0442\u0447\u0451\u0442\u044b");
  }
  async refreshPublicReportLauncher(e, n, t) {
    if (!e || !n || !t) return false;
    let s = await this.getPublicReportRoom(e), r = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    if (!s || !r) return false;
    let a = new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      "public-report-launcher:v1"
    ), o = await e.getPersistenceReader().readByAssociation(a);
    for (let c of o || []) {
      if (!c || !c.messageId) continue;
      try {
        let d = await e.getMessageReader().getById(c.messageId);
        if (d && d.sender) await n.getDeleter().deleteMessage(d, d.sender);
      } catch (d) {
        this.getLogger().warn(`Could not remove previous Otchet launcher: ${d && d.message || d}`);
      }
    }
    await t.removeByAssociation(a);
    try {
      let c = [];
      for (let d = 0; d < 5; d += 1) {
        let m = await e.getRoomReader().getMessages(s.id, {
          limit: 100,
          skip: d * 100,
          sort: { createdAt: "desc" },
          showThreadMessages: false
        });
        if (!m || !m.length) break;
        c.push(...m);
      }
      for (let d of c) {
        if (!d || !d.sender || d.sender.id !== r.id) continue;
        let m = String(d.text || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
        let u = m.indexOf("заполнить отчет") !== -1 || m.indexOf("заполнить следующий отчет") !== -1 || m.indexOf("выберите нужный отчет") !== -1 || m.indexOf("заполнить / исправить") !== -1 || m.indexOf("мужские мастера") !== -1 && m.indexOf("заполнить") !== -1 || m.indexOf("женские мастера") !== -1 && m.indexOf("заполнить") !== -1 || m.indexOf("бровисты") !== -1 && m.indexOf("заполнить") !== -1 || m.indexOf("мастера маникюра") !== -1 && m.indexOf("заполнить") !== -1;
        if (u) await n.getDeleter().deleteMessage(d, d.sender);
      }
    } catch (c) {
      this.getLogger().warn(`Could not remove legacy Otchet launchers: ${c && c.message || c}`);
    }
    return true;
  }
  async sendPersonalReportLink(e, n, t, s, r, a = "male") {
    if (this.isPersonalReportRoom(s)) {
      const targetUser = await this.masterUserForPersonalReportRoom(e, s, r);
      if (!targetUser) return;
      r = targetUser;
    }
    let b = this.reportButtonAssociation(r.id, s.id);
    let R = this.isPersonalReportRoom(s), m = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser(), u = n.getCreator().getBlockBuilder(), I = a === "female" ? "ЖЕНСКИЙ ОТЧЁТ" : a === "brow" ? "ОТЧЁТ БРОВИСТА" : a === "manicure" ? "ОТЧЁТ МАНИКЮРА" : "МУЖСКОЙ ОТЧЁТ";
    if (!m) return;
    if (!R) {
      let d2 = n.getNotifier(), f2 = d2.getMessageBuilder().setSender(m).setRoom(s).setText("Отчёт теперь заполняется только в личном чате TARS мастера. Откройте личный #tars-логин.").getMessage();
      await d2.notifyUser(r, f2);
      return;
    }
    let o = this.createToken(), c = new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      o
    );
    await t.createWithAssociation(
      { token: o, userId: r.id, username: r.username || "", userName: r.name || "", roomId: s.id, sourceRoomId: s.id, reportType: a, workday: this.reportWorkday(), expiresAt: Date.now() + D },
      c
    );
    let linkCreatedAt = Date.now(), linkVersion = "0.9.344", d = `${a === "female" ? W : a === "brow" ? H : a === "manicure" ? V : M}?token=${encodeURIComponent(o)}&v=${encodeURIComponent(linkVersion)}&cb=${linkCreatedAt}`;
    u.addSectionBlock({
      text: u.newMarkdownTextObject(
        `[*🟧 ЗАПОЛНИТЬ / ИСПРАВИТЬ ${I}*](${d})`
      )
    });
    // Create the new button first; only remove the previous one once the new
    // message is confirmed, so a failed creation never leaves the master
    // without any button to press.
    let f = n.getCreator().startMessage().setSender(m).setRoom(s).setText(`ЗАПОЛНИТЬ / ИСПРАВИТЬ ${I}`).setBlocks(u), h = await n.getCreator().finish(f);
    if (!h) {
      this.getLogger().warn("Report button message was not created; keeping the previous one in place");
      return;
    }
    try {
      await this.removeLegacyPersonalReportMenus(e, n, s);
      let g = await e.getPersistenceReader().readByAssociation(b);
      for (let v of g || []) {
        if (!v || !v.messageId || v.messageId === h) continue;
        let q = await e.getMessageReader().getById(v.messageId);
        if (q) await n.getDeleter().deleteMessage(q, q.sender);
      }
    } catch (g) {
      this.getLogger().warn(`Could not remove previous report button: ${g && g.message || g}`);
    }
    await t.removeByAssociation(b);
    await t.createWithAssociation({ userId: r.id, roomId: s.id, messageId: h, reportType: a, createdAt: Date.now() }, b);
  }
  async publishDefaultTable(e, n, t) {
    let s = await e.getRoomReader().getByName("Otchet") || await e.getRoomReader().getByName("otchet");
    if (!s) {
      this.getLogger().warn(
        "\u041A\u0430\u043D\u0430\u043B Otchet \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D: \u0442\u0430\u0431\u043B\u0438\u0446\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u043D\u0435 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u0430"
      );
      return;
    }
    let r = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    await this.postReportTable(n, s, r || t);
  }
  async publishFemaleTable(e, n, t) {
    let s = await e.getRoomReader().getByName("Otchet") || await e.getRoomReader().getByName("otchet");
    if (!s) {
      this.getLogger().warn("Канал Otchet не найден: женская таблица не опубликована");
      return;
    }
    let r = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    await this.postFemaleReportTable(n, s, r || t);
  }
  async publishBrowTable(e, n, t) {
    let s = await e.getRoomReader().getByName("Otchet") || await e.getRoomReader().getByName("otchet");
    if (!s) {
      this.getLogger().warn("Канал Otchet не найден: таблица бровистов не опубликована");
      return;
    }
    let r = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    await this.postBrowReportTable(n, s, r || t);
  }
  async publishManicureTable(e, n, t) {
    let s = await e.getRoomReader().getByName("Otchet") || await e.getRoomReader().getByName("otchet");
    if (!s) {
      this.getLogger().warn("Канал Otchet не найден: таблица маникюра не опубликована");
      return;
    }
    let r = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    await this.postManicureReportTable(n, s, r || t);
  }
  addReportRow(e, n, t) {
    e.addDividerBlock(), e.addSectionBlock({
      text: e.newMarkdownTextObject(`*${t}. ${n.label}*`)
    }), n.customName && e.addInputBlock({
      blockId: `${n.id}-name`,
      label: e.newPlainTextObject(
        "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438"
      ),
      optional: true,
      element: e.newPlainTextInputElement({
        actionId: b,
        placeholder: e.newPlainTextObject(
          "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0443\u043A\u043B\u0430\u0434\u043A\u0430"
        )
      })
    }), e.addInputBlock({
      blockId: `${n.id}-quantity`,
      label: e.newPlainTextObject(
        "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E"
      ),
      optional: true,
      element: e.newPlainTextInputElement({
        actionId: b,
        placeholder: e.newPlainTextObject(n.kind === "sale" ? "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0434\u0430\u0436 \xD7 200 \u20BD" : "\u0415\u0441\u043B\u0438 \u043E\u0434\u043D\u0430 \u2014 \u043C\u043E\u0436\u043D\u043E \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0442\u044C")
      })
    }), n.kind !== "sale" && e.addInputBlock({
      blockId: `${n.id}-amount`,
      label: e.newPlainTextObject(
        "\u041E\u0431\u0449\u0430\u044F \u0441\u0443\u043C\u043C\u0430, \u20BD"
      ),
      optional: true,
      element: e.newPlainTextInputElement({
        actionId: b,
        placeholder: e.newPlainTextObject(
          "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: 2000"
        )
      })
    });
  }
  addPaymentInputs(e) {
    e.addDividerBlock(), e.addSectionBlock({
      text: e.newMarkdownTextObject(
        "*\u041E\u043F\u043B\u0430\u0442\u0430*"
      )
    }), e.addInputBlock({
      blockId: "cash-amount",
      label: e.newPlainTextObject(
        "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435, \u20BD"
      ),
      optional: false,
      element: e.newPlainTextInputElement({
        actionId: b,
        placeholder: e.newPlainTextObject(
          "\u0415\u0441\u043B\u0438 \u043D\u0435\u0442 \u2014 \u043F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 0"
        )
      })
    }), e.addInputBlock({
      blockId: "transfers-amount",
      label: e.newPlainTextObject(
        "\u0427\u0435\u043A\u0438 / \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u044B, \u20BD"
      ),
      optional: false,
      element: e.newPlainTextInputElement({
        actionId: b,
        placeholder: e.newPlainTextObject(
          "\u0415\u0441\u043B\u0438 \u043D\u0435\u0442 \u2014 \u043F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 0"
        )
      })
    });
  }
  getValue(e, n) {
    let t = e[n] && e[n][b];
    return typeof t == "string" ? t.trim() : "";
  }
  parsePositiveNumber(e) {
    if (!e) return;
    let n = e.replace(/\s+/g, "").replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(n)) return;
    let t = Number(n);
    return Number.isFinite(t) ? t : void 0;
  }
  formatRubles(e) {
    let t = e.toFixed(2).replace(/\.00$/, "").replace(".", ",").split(",");
    return t[0] = t[0].replace(/\B(?=(\d{3})+(?!\d))/g, " "), `${t.join(",")} \u20BD`;
  }
  createToken() {
    let e = Array.from({ length: 6 }).map(() => Math.random().toString(36).slice(2, 10)).join("");
    return `${Date.now().toString(36)}${e}`;
  }
  reportTitle(e = "male") {
    return e === "female" ? "🟧 ОТЧЁТ ЖЕНСКОГО МАСТЕРА" : e === "brow" ? "🟧 ОТЧЁТ БРОВИСТА" : e === "manicure" ? "🟧 ОТЧЁТ МАСТЕРА МАНИКЮРА" : "🟧 ОТЧЁТ МУЖСКОГО МАСТЕРА";
  }
  async cleanupReportDuplicates(e, n, t, s, r = "male", a = "", p = "", reportOwner = null) {
    if (!e || !n || !t || !t.id || !s || !s.id || !p) return { removed: 0, failed: 0 };
    let i = 0, o = 0, x = this.reportTitle(r), v;
    try {
      v = await e.getRoomReader().getMessages(t.id, {
        limit: 100,
        skip: 0,
        sort: { createdAt: "desc" },
        showThreadMessages: false
      });
    } catch (c) {
      this.getLogger().warn(`Could not inspect previous ${r} reports in ${t.id}: ${c && c.message || c}`);
      return { removed: 0, failed: 1 };
    }
    let d;
    try {
      d = await e.getUserReader().getByUsername("tars") || await e.getUserReader().getAppUser();
    } catch (c) {
      d = void 0;
    }
    let ownerName = reportOwner && (reportOwner.username || reportOwner.name) || "", ownerMarker = ownerName ? `Мастер: *@${ownerName}*` : "";
    for (let c of v || []) {
      let m = c && (c.id || c._id) || "";
      if (!m || m === p || String(c.text || "").indexOf(x) === -1) continue;
      if (ownerMarker && String(c.text || "").indexOf(ownerMarker) === -1) continue;
      let u = c.sender && c.sender.id || c.u && (c.u.id || c.u._id) || "";
      if (u !== s.id) continue;
      let I = c.createdAt || c.ts || c._updatedAt || c.updatedAt, f = I ? this.reportWorkday(new Date(I)) : "";
      if (a && f !== a) continue;
      try {
        await n.getDeleter().deleteMessage(c, c.sender || s);
        i += 1;
      } catch (h) {
        if (d && d.id && d.id !== u) {
          try {
            await n.getDeleter().deleteMessage(c, d);
            i += 1;
            continue;
          } catch (O) {
          }
        }
        o += 1;
        this.getLogger().warn(`Previous corrected report ${m} could not be removed from ${t.id}: ${h && h.message || h}`);
      }
    }
    return { removed: i, failed: o };
  }
  maleClientCountFromRows(e) {
    const normalize = (n) => String(n || "").toLowerCase().replace(/ё/g, "е");
    return (e || []).filter((n) => n && n.kind === "service" && normalize(n.label).indexOf("стриж") !== -1).reduce((n, t) => n + (Number(t.quantity) || 0), 0);
  }
  maleBeardCountFromRows(e) {
    const normalize = (n) => String(n || "").toLowerCase().replace(/ё/g, "е");
    return (e || []).filter((n) => n && n.kind === "service" && normalize(n.label).indexOf("бород") !== -1).reduce((n, t) => n + (Number(t.quantity) || 0), 0);
  }
  maleResultRating(e) {
    let n = Number(e) || 0;
    return n >= 20 ? "⭐ Супер" : n >= 15 ? "🔥 Очень хорошо" : n >= 10 ? "✅ Хорошо" : n >= 5 ? "➖ Слабо" : "⬇️ Очень плохо";
  }
  femaleServiceCountsFromRows(e) {
    const normalize = (n) => String(n || "").toLowerCase().replace(/ё/g, "е");
    let simple = 0, complex = 0, other = 0;
    for (const row of e || []) {
      if (!row || row.kind !== "service") continue;
      const label = normalize(row.label), quantity = Number(row.quantity) || 0;
      if (label.indexOf("простое окраш") !== -1) simple += quantity;
      else if (label.indexOf("сложное окраш") !== -1) complex += quantity;
      else other += quantity;
    }
    return { simple, complex, other };
  }
  femaleResultRating(e) {
    const simple = Number(e && e.simple) || 0, complex = Number(e && e.complex) || 0, other = Number(e && e.other) || 0;
    if (complex >= 2 && other >= 3) return "⭐ Супер";
    if (complex >= 1 && other >= 5) return "🔥 Очень хорошо";
    if (complex >= 1 && other >= 2) return "✅ Хорошо";
    if (complex >= 1) return "➖ Слабо";
    if (simple >= 3 && other >= 5) return "⭐ Супер";
    if (simple >= 2 && other >= 5) return "🔥 Очень хорошо";
    if (simple >= 1 && other >= 4) return "✅ Хорошо";
    if (simple >= 1 && other >= 3) return "➖ Слабо";
    return "⬇️ Очень плохо";
  }
  serviceCountFromRows(e) {
    return (e || []).filter((n) => n && n.kind === "service").reduce((n, t) => n + (Number(t.quantity) || 0), 0);
  }
  browResultRating(e) {
    let n = Number(e) || 0;
    return n >= 9 ? "⭐ Супер" : n >= 8 ? "🔥 Очень хорошо" : n >= 5 ? "✅ Хорошо" : n >= 3 ? "➖ Слабо" : n >= 1 ? "⬇️ Очень плохо" : "⬇️ Очень плохо";
  }
  manicureResultRating(e) {
    let n = Number(e) || 0;
    return n >= 7 ? "⭐ Супер" : n >= 5 ? "🔥 Очень хорошо" : n >= 3 ? "✅ Хорошо" : n >= 2 ? "➖ Слабо" : "⬇️ Очень плохо";
  }
  dailyLimitStatus(p = "male", s = []) {
    if (p === "male") {
      const clients = this.maleClientCountFromRows(s);
      return { met: clients >= 10, value: clients, label: `клиентов ${clients}/10` };
    }
    if (p === "female") {
      const counts = this.femaleServiceCountsFromRows(s);
      const met = counts.complex >= 1 && counts.other >= 2 || counts.simple >= 1 && counts.other >= 4;
      return { met, value: counts.simple + counts.complex + counts.other, label: `простых ${counts.simple}, сложных ${counts.complex}, других ${counts.other}` };
    }
    if (p === "brow") {
      const count = this.serviceCountFromRows(s);
      return { met: count >= 5, value: count, label: `услуг ${count}/5` };
    }
    if (p === "manicure") {
      const count = this.serviceCountFromRows(s);
      return { met: count >= 3, value: count, label: `услуг ${count}/3` };
    }
    const count = this.serviceCountFromRows(s);
    return { met: true, value: count, label: `услуг ${count}` };
  }
  payrollRule(p = "male", s = [], mailings = 0, mailingProof = null) {
    const limit = this.dailyLimitStatus(p, s), mailingCount = Math.max(0, Math.floor(Number(mailings) || 0)), proofCount = Math.max(0, Math.floor(Number(mailingProof && mailingProof.count) || 0)), proofOk = proofCount > 0, mailingOk = proofOk, rate = limit.met || mailingOk ? 0.5 : 0.4;
    return { limit, mailings: mailingCount, proofCount, proofOk, roomFound: !mailingProof || mailingProof.roomFound !== false, mailingOk, serviceRate: rate, servicePercent: Math.round(rate * 100) };
  }
  async sendReport(e, n, t, s, r, a, p = "male", i = "", transferVerification = null, reportOwner = null, mailings = 0, mailingProof = null, timeCorrection = null, penalties = null, finalAnalysis = true) {
    const effectiveMailingProof = finalAnalysis ? mailingProof : { roomFound: true, count: 1 };
    let payroll = this.payrollRule(p, s, mailings, effectiveMailingProof), correction = timeCorrection || { applied: false, amount: 0, label: "👍 до 21:00" }, correctionAmount = correction && correction.applied ? Math.min(300, Number(correction.amount) || 300) : 0, o = s.filter((i) => i.kind === "service").reduce((i, p) => i + p.amount, 0), x = s.filter((i) => i.kind === "service").reduce((i, p) => i + (p.expense || 0), 0), v = o - x, c = s.filter((i) => i.kind === "sale").reduce((i, p) => i + p.amount, 0), tipRows = s.filter((i) => i.kind === "tip"), tipTotal = tipRows.reduce((i, p) => i + p.amount, 0), tipDeduction = tipRows.reduce((i, p) => i + (p.expense || 0), 0), tipSalary = tipRows.reduce((i, p) => i + (p.netAmount || 0), 0), d = o + c + tipTotal, baseSalary = v * payroll.serviceRate + c + tipSalary, m = Math.max(0, baseSalary - correctionAmount), penaltyTotal = Math.max(0, Number(penalties && penalties.total) || 0), penaltyCount = Math.max(0, Number(penalties && penalties.count) || 0), salaryPayable = Math.max(0, m - penaltyTotal), verified = !!transferVerification && Number.isFinite(Number(transferVerification.total)), confirmedTransfers = verified ? Number(transferVerification.total) : a, transferDifference = confirmedTransfers - a, u = r + confirmedTransfers, I = u - d, shortage = I < -0.005, surplus = I > 0.005, f = (i) => this.formatRubles(i).replace(" \u20BD", ""), h = (i, p, R = false) => {
      let w = i.length > p ? i.slice(0, p) : i;
      return R ? w.padStart(p) : w.padEnd(p);
    }, shortServiceLabel = (label) => {
      const raw = String(label || "").trim(), text = raw.toLowerCase().replace(/ё/g, "е");
      if (text.indexOf("простое окраш") !== -1) return "Прост.окр";
      if (text.indexOf("сложное окраш") !== -1) return "Сложн.окр";
      if (text.indexOf("окраш") !== -1) return "Окраш.";
      if (text.indexOf("женская стриж") !== -1) return "Жен.стриж";
      if (text.indexOf("уход") !== -1) return "Уход";
      return raw;
    }, formatServiceRow = (row) => {
      const amount = row.kind === "tip" ? row.netAmount : row.amount;
      if (row.kind !== "tip" && row.expense > 0) {
        return [
          h(shortServiceLabel(row.label), 9),
          h(f(row.amount), 5, true),
          h(f(row.expense), 6, true),
          h(f(row.netAmount), 5, true)
        ].join(" ");
      }
      return [
        h(shortServiceLabel(row.label), 9),
        h(f(row.unitPrice), 5, true),
        h(row.kind === "tip" ? "\u2014" : String(row.quantity), 2, true),
        h(f(amount), 6, true)
      ].join(" ");
    }, O = s.map(formatServiceRow), g = (i, p, R = false) => `${h(i, 20)} ${h(`${R && p > 0 ? "+" : ""}${f(p)}`, 11, true)}`, owner = reportOwner || t, ownerNameRaw = owner && (owner.username || owner.name) || t && (t.username || t.name) || "", ownerName = String(ownerNameRaw || "").trim() || "master", maleClientCount = p === "male" ? this.maleClientCountFromRows(s) : 0, maleRating = p === "male" ? this.maleResultRating(maleClientCount) : "", femaleCounts = p === "female" ? this.femaleServiceCountsFromRows(s) : null, femaleRating = p === "female" ? this.femaleResultRating(femaleCounts) : "", serviceCount = this.serviceCountFromRows(s), clientCount = p === "male" ? maleClientCount : p === "female" && femaleCounts ? femaleCounts.simple + femaleCounts.complex + femaleCounts.other : serviceCount, browRating = p === "brow" ? this.browResultRating(serviceCount) : "", manicureRating = p === "manicure" ? this.manicureResultRating(serviceCount) : "", l = [
      p === "female" ? "**🟧 ОТЧЁТ ЖЕНСКОГО МАСТЕРА**" : p === "brow" ? "**🟧 ОТЧЁТ БРОВИСТА**" : p === "manicure" ? "**🟧 ОТЧЁТ МАСТЕРА МАНИКЮРА**" : "**🟧 ОТЧЁТ МУЖСКОГО МАСТЕРА**",
      `Мастер: *@${ownerName}*`,
      `Клиентов: *${clientCount}*`,
      ...p === "male" ? [`Оценка результата: *${maleRating}*`] : [],
      ...p === "female" ? [`Оценка результата: *${femaleRating}*`] : [],
      ...p === "brow" ? [`Оценка результата: *${browRating}*`] : [],
      ...p === "manicure" ? [`Оценка результата: *${manicureRating}*`] : [],
      `Дневной лимит: *${payroll.limit.met ? "выполнен" : "не выполнен"}* (${payroll.limit.label})`,
      ...finalAnalysis && !payroll.limit.met && !payroll.proofOk ? ["Пересчёт: *нет рассылок*"] : [],
      `Процент услуг: *${payroll.servicePercent}%*`,
      `Время отчёта: *${correction.label || "👍 до 21:00"}*`,
      "```",
      p === "female" ? "\u0423\u0421\u041B\u0423\u0413\u0410    \u0421\u0423\u041C  \u0420\u0410\u0421\u0425  \u0418\u0422\u041E\u0413" : "\u0423\u0421\u041B\u0423\u0413\u0410    \u0426\u0415\u041D\u0410 \u041A  \u0418\u0422\u041E\u0413",
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      ...O,
      "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
      g("\u0418\u0442\u043E\u0433\u043E \u0443\u0441\u043B\u0443\u0433", o),
      g(p === "male" ? "\u0420\u0430\u0441\u0445\u043E\u0434\u044B \u043D\u0430 \u043E\u043A\u0440\u0430\u0448." : "\u0420\u0430\u0441\u0445\u043E\u0434\u044B", -x),
      g("\u041F\u043E\u0441\u043B\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432", v),
      g("\u041F\u0440\u043E\u0434\u0430\u0436\u0438", c),
      g("Чай переводом", tipTotal),
      g("\u0412 \u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0443 \u0441 \u0447\u0430\u044f", tipSalary),
      g(
        "\u041E\u0431\u0449\u0430\u044F \u0432\u044B\u0440\u0443\u0447\u043A\u0430",
        d
      ),
      g("\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435", r),
      g("\u041F\u0435\u0440\u0435\u0432\u043E\u0434\u044B (\u043E\u0442\u0447\u0451\u0442)", a),
      ...verified ? [
        g("\u0427\u0435\u043A\u0438 \u0422\u0430\u0440\u0441", confirmedTransfers),
        g("\u0420\u0430\u0437\u043D. \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u043E\u0432", transferDifference, true)
      ] : [],
      g(
        "\u0418\u0442\u043E\u0433\u043E \u0432 \u043A\u0430\u0441\u0441\u0435",
        u
      ),
      shortage ? g("\uD83D\uDD34 \u041D\u0415\u0414\u041E\u0421\u0422\u0410\u0427\u0410", -I) : surplus ? g("\uD83D\uDFE1 \u0418\u0417\u041B\u0418\u0428\u0415\u041A", I) : g("\uD83D\uDFE2 \u0421\u041E\u0412\u041F\u0410\u041B\u041E", 0),
      ...correctionAmount > 0 || penaltyTotal > 0 ? [
        g("Начислено за день", baseSalary),
        ...correctionAmount > 0 ? [g("Штраф за отчёт", -correctionAmount)] : [],
        ...penaltyTotal > 0 ? [g("Штрафы", -penaltyTotal)] : []
      ] : [],
      g(
        "✅ ИТОГО К ВЫПЛАТЕ",
        salaryPayable
      ),
      "```",
      ...verified ? [
        `\u0427\u0435\u043A\u043E\u0432 \u0443\u0447\u0442\u0435\u043D\u043E: *${Number(transferVerification.count) || 0}*`,
        Number(transferVerification.missing) > 0 ? `\u26A0\uFE0F \u0411\u0435\u0437 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u043E\u0439 \u0441\u0443\u043C\u043C\u044B: *${Number(transferVerification.missing)}*` : "",
        Math.abs(transferDifference) > 0.005 ? `\u26A0\uFE0F \u041F\u0435\u0440\u0435\u0432\u043E\u0434\u044B \u0432 \u043E\u0442\u0447\u0451\u0442\u0435 \u0438 \u0447\u0435\u043A\u0430\u0445 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442 \u043D\u0430 *${this.formatRubles(Math.abs(transferDifference))}*` : ""
      ].filter(Boolean) : [],
      finalAnalysis && !payroll.limit.met && !payroll.roomFound ? "⚠️ Чат rasblLki не найден: подтверждение рассылок не засчитано." : "",
      finalAnalysis && !payroll.limit.met && !payroll.proofOk ? "⚠️ Пересчёт: нет рассылок. Услуги пересчитаны по 40%." : "",
      correctionAmount > 0 ? "😔 Отчёт сдан после 21:00: корректировка начисления 300 ₽." : "",
      penaltyTotal > 0 ? `⚠️ Штрафы за день: *${this.formatRubles(penaltyTotal)}* (${penaltyCount})` : "",
      penaltyTotal > 0 && penalties && penalties.entries && penalties.entries.length ? `Штрафы: ${penalties.entries.map((R) => `${R.penaltyTitle || "Опоздание"} ${this.formatRubles(Math.max(0, Number(R.amount) || 0))}`).join("; ")}` : "",
      shortage ? `\uD83D\uDD34 \u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430: *${this.formatRubles(-I)}*` : surplus ? `\uD83D\uDFE1 \u0418\u0437\u043B\u0438\u0448\u0435\u043A: *${this.formatRubles(I)}*` : "\uD83D\uDFE2 \u041A\u0430\u0441\u0441\u0430 \u0441\u043E\u0432\u043F\u0430\u043B\u0430"
    ].filter(Boolean).join(`
`);
    let k = [{ color: shortage ? "#dc2626" : surplus ? "#f59e0b" : "#16a34a", text: shortage ? "\uD83D\uDD34 \u041D\u0415\u0414\u041E\u0421\u0422\u0410\u0427\u0410" : surplus ? "\uD83D\uDFE1 \u0418\u0417\u041B\u0418\u0428\u0415\u041A" : "\uD83D\uDFE2 \u041A\u0410\u0421\u0421\u0410 \u0421\u041E\u0412\u041F\u0410\u041B\u0410" }];
    if (i) {
      try {
        let previousBuilder = await e.getUpdater().message(i, t), previousMessage = previousBuilder.getMessage();
        if (!previousMessage) throw new Error("previous report message is unavailable");
        await e.getDeleter().deleteMessage(previousMessage, previousMessage.sender || t);
      } catch (previousError) {
        this.getLogger().warn(`Previous report ${i} could not be removed; a replacement will be created: ${previousError && previousError.message || previousError}`);
      }
    }
    let previousBuilder = e.getCreator().startMessage().setSender(t).setRoom(n).setText(l).addAttachment(k[0]);
    return await e.getCreator().finish(previousBuilder);
  }
  async sendOwnerShortReport(e, n, reportOwner, rows, cash, transfers, reportType = "male", previousMessageId = "", transferVerification = null, mailings = 0, mailingProof = null, timeCorrection = null, penalties = null, finalAnalysis = true, workday = "") {
    try {
      const config = await this.receiptOcrConfig(n), appUser = await n.getUserReader().getByUsername("tars") || await n.getUserReader().getAppUser(), ownerUsernames = ["teimur", "shura", config && config.ownerUsername, config && config.adminUsername].map((value) => String(value || "").replace(/^@/, "").trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
      if (!appUser || !appUser.username || !ownerUsernames.length) return previousMessageId || "";
      const effectiveMailingProof = finalAnalysis ? mailingProof : { roomFound: true, count: 1 }, payroll = this.payrollRule(reportType, rows, mailings, effectiveMailingProof), correction = timeCorrection || { applied: false, amount: 0 }, correctionAmount = correction && correction.applied ? Math.min(300, Number(correction.amount) || 300) : 0, serviceTotal = rows.filter((row) => row.kind === "service").reduce((sum, row) => sum + row.amount, 0), expenseTotal = rows.filter((row) => row.kind === "service").reduce((sum, row) => sum + (row.expense || 0), 0), salesTotal = rows.filter((row) => row.kind === "sale").reduce((sum, row) => sum + row.amount, 0), tipSalary = rows.filter((row) => row.kind === "tip").reduce((sum, row) => sum + (row.netAmount || 0), 0), penaltyTotal = Math.max(0, Number(penalties && penalties.total) || 0), salaryPayable = Math.max(0, (serviceTotal - expenseTotal) * payroll.serviceRate + salesTotal + tipSalary - correctionAmount - penaltyTotal), verified = !!transferVerification && Number.isFinite(Number(transferVerification.total)), confirmedTransfers = verified ? Number(transferVerification.total) : transfers, transferDifference = confirmedTransfers - transfers, revenue = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), cashDifference = Number(cash || 0) + confirmedTransfers - revenue;
      const femaleCounts = reportType === "female" ? this.femaleServiceCountsFromRows(rows) : null, clientCount = reportType === "male" ? this.maleClientCountFromRows(rows) : femaleCounts ? femaleCounts.simple + femaleCounts.complex + femaleCounts.other : this.serviceCountFromRows(rows), violations = [];
      if (finalAnalysis && !payroll.limit.met && !payroll.proofOk) violations.push("нет рассылок — 40%");
      if (correctionAmount > 0) violations.push("отчёт после 21:00");
      if (penalties && Array.isArray(penalties.entries)) for (const entry of penalties.entries) violations.push(`${entry.penaltyTitle || "штраф"} ${this.formatRubles(Math.max(0, Number(entry.amount) || 0))}`);
      if (verified && Number(transferVerification.missing) > 0) violations.push(`чеки без суммы: ${Number(transferVerification.missing)}`);
      if (verified && Math.abs(transferDifference) > 0.005) violations.push(`переводы не совпадают: ${this.formatRubles(Math.abs(transferDifference))}`);
      if (cashDifference < -0.005) violations.push(`недостача: ${this.formatRubles(-cashDifference)}`);
      else if (cashDifference > 0.005) violations.push(`излишек: ${this.formatRubles(cashDifference)}`);
      const masterName = String(reportOwner && (reportOwner.username || reportOwner.name) || "master").replace(/^@/, ""), date = this.displayWorkday(workday || this.reportWorkday()), text = [`📊 *${date} · @${masterName}*`, `Клиентов: *${clientCount}*`, `Зарплата: *${this.formatRubles(salaryPayable)}*`, `Нарушения: ${violations.length ? violations.join("; ") : "нет ✅"}`].join("\n");
      let primaryMessageId = "";
      for (const ownerUsername of ownerUsernames) {
        try {
          const ownerUser = await n.getUserReader().getByUsername(ownerUsername);
          if (!ownerUser || ownerUser.id === appUser.id) continue;
          const ownerRoom = await this.getOrCreateDirectRoom(n, e, appUser, ownerUser);
          if (!ownerRoom) continue;
          if (previousMessageId && !primaryMessageId) {
            try {
              const previousBuilder = await e.getUpdater().message(previousMessageId, appUser), previousMessage = previousBuilder.getMessage();
              if (previousMessage) await e.getDeleter().deleteMessage(previousMessage, previousMessage.sender || appUser);
            } catch (previousError) {
              this.getLogger().warn(`Could not replace owner short report ${previousMessageId}: ${previousError && previousError.message || previousError}`);
            }
          }
          const builder = e.getCreator().startMessage().setSender(appUser).setRoom(ownerRoom).setText(text);
          const createdMessageId = await e.getCreator().finish(builder);
          if (!primaryMessageId) primaryMessageId = String(createdMessageId || "");
        } catch (ownerError) {
          this.getLogger().warn(`Could not send owner short report to ${ownerUsername}: ${ownerError && ownerError.message || ownerError}`);
        }
      }
      return primaryMessageId || previousMessageId || "";
    } catch (error) {
      this.getLogger().warn(`Could not send owner short report: ${error && error.message || error}`);
      return previousMessageId || "";
    }
  }
  async sendPublicClientSummary(e, n, t, s, r, a = "male", p = "") {
    let serviceRows = s.filter((o) => o.kind === "service"), x = r.username || r.name || "master", d;
    if (a === "male") {
      const clientCount = this.maleClientCountFromRows(serviceRows), beardCount = this.maleBeardCountFromRows(serviceRows), rating = this.maleResultRating(clientCount);
      d = `\uD83C\uDFC6 @${x} \u2014 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432: *${clientCount}* · \u0431\u043E\u0440\u043E\u0434: *${beardCount}* · ${rating}`;
    } else if (a === "female") {
      const counts = this.femaleServiceCountsFromRows(serviceRows), rating = this.femaleResultRating(counts);
      d = `\uD83C\uDFC6 @${x} \u2014 \u043F\u0440\u043E\u0441\u0442\u044B\u0445: *${counts.simple}* · \u0441\u043B\u043E\u0436\u043D\u044B\u0445: *${counts.complex}* · \u0434\u0440\u0443\u0433\u0438\u0445: *${counts.other}* · ${rating}`;
    } else if (a === "brow") {
      const count = this.serviceCountFromRows(serviceRows), rating = this.browResultRating(count);
      d = `\uD83C\uDFC6 @${x} \u2014 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u0431\u0440\u043E\u0432\u0438\u0441\u0442\u0430: *${count}* · ${rating}`;
    } else if (a === "manicure") {
      const count = this.serviceCountFromRows(serviceRows), rating = this.manicureResultRating(count);
      d = `\uD83C\uDFC6 @${x} \u2014 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u043C\u0430\u043D\u0438\u043A\u044E\u0440\u0430: *${count}* · ${rating}`;
    } else {
      let i = serviceRows.reduce((o, c) => o + (Number(c.quantity) || 0), 0), v = a === "female" ? "женских клиентов" : a === "brow" ? "клиентов бровиста" : a === "manicure" ? "клиентов маникюра" : "клиентов";
      d = `\uD83C\uDFC6 @${x} \u2014 ${v}: *${i}*`;
    }
    if (p) {
      try {
        let previousBuilder = await e.getUpdater().message(p, t), previousMessage = previousBuilder.getMessage();
        if (!previousMessage) throw new Error("previous public summary is unavailable");
        await e.getDeleter().deleteMessage(previousMessage, previousMessage.sender || t);
      } catch (previousError) {
        this.getLogger().warn(`Previous public summary ${p} could not be removed; a replacement will be created: ${previousError && previousError.message || previousError}`);
      }
    }
    let m = e.getCreator().startMessage().setSender(t).setRoom(n).setText(d);
    return await e.getCreator().finish(m);
  }
  validateSubmittedReport(e, n = "male") {
    if (n !== "female" && n !== "male") return "";
    let t = e && Array.isArray(e.rows) ? e.rows : [];
    for (let s of t.slice(0, 20)) {
      let r = this.parseApiNumber(s.price), a = s.sale === true, tip = s.tip === true || String(s.name || "").trim().toLowerCase().startsWith("чай"), p = a || tip ? 1 : this.parseApiNumber(s.quantity), o = typeof s.name == "string" ? s.name.trim().slice(0, 60) : "";
      if (!o || r <= 0 || p <= 0 || !a && !tip && !Number.isInteger(p) || a || tip) continue;
      let x = s.expense, v = x !== void 0 && x !== null && String(x).trim() !== "";
      if (!v) continue;
      let c = typeof x == "string" ? x.replace(/\s+/g, "").replace(",", ".") : x, d = Number(c);
      if (!Number.isFinite(d) || d < 0 || d > 1e8)
        return `\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0441\u0445\u043E\u0434 \u0434\u043B\u044F \u00AB${o}\u00BB`;
    }
    return "";
  }
  defaultFemaleExpense(e, n) {
    let t = String(e || "").trim().toLowerCase(), s = Number(n);
    if (!Number.isInteger(s) || s <= 0) return null;
    return t.includes("\u0441\u043B\u043E\u0436\u043D") ? 2e3 * s : t.includes("\u043F\u0440\u043E\u0441\u0442") ? 1500 * s : null;
  }
  defaultMaleExpense(e, n) {
    let t = String(e || "").trim().toLowerCase(), s = Number(n);
    if (!Number.isInteger(s) || s <= 0) return null;
    return t.includes("\u043E\u043A\u0440\u0430\u0448") ? 400 * s : null;
  }
  parseSubmittedReport(e, p = "male") {
    let n = e && Array.isArray(e.rows) ? e.rows : [], t = [];
    if (n.slice(0, 20).forEach((s) => {
      let r = this.parseApiNumber(s.price), a = s.sale === true, tip = s.tip === true || String(s.name || "").trim().toLowerCase().startsWith("чай"), saleQuantity = a ? this.parseApiNumber(s.quantity) : 0, o = a ? saleQuantity : tip ? 1 : this.parseApiNumber(s.quantity), c = typeof s.name == "string" ? s.name.trim().slice(0, 60) : "", d = s.expense !== void 0 && s.expense !== null && String(s.expense).trim() !== "", m = a || tip ? 0 : this.parseApiNumber(s.expense), u = !a && !tip && !d ? p === "female" ? this.defaultFemaleExpense(c, o) : p === "male" ? this.defaultMaleExpense(c, o) : null : null, I = a ? 200 * o : tip ? r : r * o, tipDeduction = tip && I > 0 ? Math.min(50, I) : 0, f = tip ? tipDeduction : Math.min(u === null ? m : u, I);
      !c || r <= 0 || o <= 0 || !a && !tip && !Number.isInteger(o) || t.push({
        label: c,
        quantity: o,
        unitPrice: a ? 200 : r,
        amount: I,
        expense: f,
        netAmount: I - f,
        kind: tip ? "tip" : a ? "sale" : "service"
      });
    }), t.length !== 0)
      return {
        rows: t,
        cash: this.parseApiNumber(e && e.cash),
        transfers: this.parseApiNumber(e && e.transfers),
        mailings: this.parseApiNumber(e && e.mailings)
      };
  }
  submittedFormData(e) {
    return {
      rows: e.rows.map((n) => ({
        name: n.label,
        price: n.unitPrice,
        quantity: n.quantity,
        sale: n.kind === "sale",
        tip: n.kind === "tip",
        expense: n.kind === "sale" || n.kind === "tip" ? 0 : n.expense
      })),
      cash: e.cash,
      transfers: e.transfers,
      mailings: e.mailings || 0
    };
  }
  parseApiNumber(e) {
    let n = typeof e == "string" ? e.replace(/\s+/g, "").replace(",", ".") : e, t = Number(n);
    return Number.isFinite(t) && t >= 0 && t <= 1e8 ? t : 0;
  }
};
exports.TarsReportApp = C;
var S = class extends A.ApiEndpoint {
  constructor(e) {
    super(e);
    this.reportApp = e, this.path = "submit-report";
  }
  async options() {
    return {
      status: T.HttpStatusCode.NO_CONTENT,
      headers: this.corsHeaders()
    };
  }
  async get(e, n, t, s, r, a) {
    let o = this.requestToken(e);
    if (!o || o.length > 100)
      return this.response(
        T.HttpStatusCode.UNAUTHORIZED,
        false,
        "Откройте новую таблицу командой /otchet"
      );
    let c = new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      o
    ), d = await t.getPersistenceReader().readByAssociation(c), m = d.length > 0 ? d[0] : void 0;
    if (!m || m.token !== o || m.expiresAt < Date.now())
      return m && await a.removeByAssociation(c), this.response(
        T.HttpStatusCode.UNAUTHORIZED,
        false,
        "Ссылка устарела. Введите /otchet ещё раз"
      );
    let tokenRoom;
    try {
      tokenRoom = m.sourceRoomId ? await t.getRoomReader().getById(m.sourceRoomId) : void 0;
    } catch (tokenRoomError) {
      tokenRoom = void 0;
    }
    const tokenMaster = tokenRoom && this.reportApp.isPersonalReportRoom(tokenRoom) ? await this.reportApp.masterUserForPersonalReportRoom(t, tokenRoom) : void 0;
    if (!tokenRoom || !tokenMaster || String(tokenMaster.id || "") !== String(m.userId || "")) {
      await a.removeByAssociation(c);
      return this.response(
        T.HttpStatusCode.UNAUTHORIZED,
        false,
        "Ссылка создана не для этого мастера. Откройте свежую нижнюю кнопку в своём чате."
      );
    }
    let u = m.reportType === "female" ? "female" : m.reportType === "brow" ? "brow" : m.reportType === "manicure" ? "manicure" : "male", I = typeof m.workday == "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.workday) ? m.workday : this.reportApp.reportWorkday(), f = this.reportApp.reportAssociation(m.userId, u, I), h = await t.getPersistenceReader().readByAssociation(f), O = h.filter((R) => R && R.userId === m.userId && R.reportType === u && R.workday === I).sort((R, Q) => Number(Q.updatedAt || 0) - Number(R.updatedAt || 0))[0], P = O && O.formData ? O.formData : null, proofUser = void 0, proofStatus = { count: 0 }, mailingProof = { roomFound: true, count: 0 };
    try {
      proofUser = await t.getUserReader().getById(m.userId);
    } catch (proofUserError) {
    }
    if (proofUser) {
      proofStatus = await this.reportApp.reportPhotoStatus(t, proofUser, I);
      mailingProof = await this.reportApp.mailingProofStatus(t, proofUser, I);
    }
    const reportExists = !!P;
    const penalties = reportExists ? await this.reportApp.latenessSummary(t, m.userId, I) : { total: 0, entries: [] };
    const penaltyTotal = Math.max(0, Number(penalties && penalties.total) || 0), penaltyText = penalties && penalties.entries && penalties.entries.length ? penalties.entries.map((R) => `${R.penaltyTitle || "Штраф"} ${this.reportApp.formatRubles(Math.max(0, Number(R.amount) || 0))}`).join("; ") : "";
    const violationDeduction = reportExists && proofStatus && Number(proofStatus.count) > 0 ? 0 : reportExists ? 300 : 0;
    const parsedForPayroll = P ? this.reportApp.parseSubmittedReport(P, u) : null, payroll = this.reportApp.payrollRule(u, parsedForPayroll && parsedForPayroll.rows || [], 0, mailingProof), mailingRecalc = reportExists && !payroll.limit.met && !payroll.proofOk;
    return this.dataResponse(T.HttpStatusCode.OK, {
      ok: true,
      message: P ? "Сохранённый отчёт загружен" : "Новый отчёт",
      existing: !!P,
      reportType: u,
      workday: I,
      formData: P,
      report: P,
      rows: P ? P.rows : [],
      cash: P ? P.cash : "",
      transfers: P ? P.transfers : "",
      penaltyTotal,
      penaltyText,
      servicePercent: payroll.servicePercent,
      mailingProofOk: !!payroll.proofOk,
      mailingProofCount: payroll.proofCount,
      mailingRecalc,
      mailingRecalcText: mailingRecalc ? "Пересчёт: нет рассылок" : "",
      violationDeduction,
      violationDeductionLabel: violationDeduction > 0 ? "Вычет за нарушение: нет фото отчёта" : ""
    });
  }
  async post(e, n, t, s, r, a) {
    let o = this.normalizeContent(e.content), c = o && typeof o.token == "string" ? o.token.trim() : "";
    if ((!o || !Array.isArray(o.rows)) && e && e.query) {
      let queryPayload = e.query.payload || e.query.data || e.query.content || "";
      if (queryPayload) {
        let queryContent = this.normalizeContent(queryPayload);
        queryContent && Object.assign(o, queryContent);
        c = o && typeof o.token == "string" ? o.token.trim() : c;
      }
    }
    if (!c) c = this.requestToken(e);
    if (!c || c.length > 100)
      return this.response(
        T.HttpStatusCode.UNAUTHORIZED,
        false,
        "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0442\u0430\u0431\u043B\u0438\u0446\u0443 \u043A\u043E\u043C\u0430\u043D\u0434\u043E\u0439 /otchet"
      );
    let d = new y.RocketChatAssociationRecord(
      y.RocketChatAssociationModel.MISC,
      c
    ), m = await t.getPersistenceReader().readByAssociation(d), u = m.length > 0 ? m[0] : void 0;
    if (!u || u.token !== c || u.expiresAt < Date.now())
      return u && await a.removeByAssociation(d), this.response(
        T.HttpStatusCode.UNAUTHORIZED,
        false,
        "\u0421\u0441\u044B\u043B\u043A\u0430 \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0430. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 /otchet \u0435\u0449\u0451 \u0440\u0430\u0437"
      );
    let tokenRoom;
    try {
      tokenRoom = u.sourceRoomId ? await t.getRoomReader().getById(u.sourceRoomId) : void 0;
    } catch (tokenRoomError) {
      tokenRoom = void 0;
    }
    const tokenMaster = tokenRoom && this.reportApp.isPersonalReportRoom(tokenRoom) ? await this.reportApp.masterUserForPersonalReportRoom(t, tokenRoom) : void 0;
    if (!tokenRoom || !tokenMaster || String(tokenMaster.id || "") !== String(u.userId || "")) {
      await a.removeByAssociation(d);
      return this.response(
        T.HttpStatusCode.UNAUTHORIZED,
        false,
        "\u0421\u0441\u044B\u043B\u043A\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u043D\u0435 \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043C\u0430\u0441\u0442\u0435\u0440\u0430. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0432\u0435\u0436\u0443\u044E \u043D\u0438\u0436\u043D\u044E\u044E \u043A\u043D\u043E\u043F\u043A\u0443 \u0432 \u0441\u0432\u043E\u0451\u043C \u0447\u0430\u0442\u0435."
      );
    }
    let cashRaw = o && Object.prototype.hasOwnProperty.call(o, "cash") ? String(o.cash ?? "").trim() : "", transfersRaw = o && Object.prototype.hasOwnProperty.call(o, "transfers") ? String(o.transfers ?? "").trim() : "";
    if (!cashRaw || !transfersRaw)
      return this.response(
        T.HttpStatusCode.BAD_REQUEST,
        false,
        "Заполните наличные и чеки / переводы. Если суммы нет — поставьте 0."
      );
    const validPaymentAmount = (value) => {
      const clean = typeof value == "string" ? value.replace(/\s+/g, "").replace(",", ".") : value, amount = Number(clean);
      return Number.isFinite(amount) && amount >= 0 && amount <= 1e8;
    };
    if (!validPaymentAmount(o.cash) || !validPaymentAmount(o.transfers))
      return this.response(
        T.HttpStatusCode.BAD_REQUEST,
        false,
        "Введите наличные и чеки / переводы цифрами."
      );
    let I = u.reportType === "female" ? "female" : u.reportType === "brow" ? "brow" : u.reportType === "manicure" ? "manicure" : "male", f = this.reportApp.validateSubmittedReport(o, I);
    if (f)
      return this.response(
        T.HttpStatusCode.BAD_REQUEST,
        false,
        f
      );
    let h = this.reportApp.parseSubmittedReport(o, I);
    if (!h)
      return this.response(
        T.HttpStatusCode.BAD_REQUEST,
        false,
        "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0443\u0441\u043B\u0443\u0433\u0443 \u0438\u043B\u0438 \u043F\u0440\u043E\u0434\u0430\u0436\u0443"
      );
    const safeRoomById = async (roomId, label) => {
      if (!roomId) return void 0;
      try {
        const room = await t.getRoomReader().getById(roomId);
        const slug = String(room && room.slugifiedName || "").toLowerCase();
        const name = String(room && (room.displayName || room.name || "") || "").toLowerCase();
        if (label === "cash" && (slug === "general" || name === "general")) return void 0;
        return room;
      } catch (safeError) {
        this.reportApp.getLogger().warn(`Ignored invalid ${label} room id for submitted report: ${safeError && safeError.message || safeError}`);
        return void 0;
      }
    };
    const safeUserById = async (userId) => {
      if (!userId) return void 0;
      try {
        return await t.getUserReader().getById(userId);
      } catch (safeError) {
        this.reportApp.getLogger().warn(`Ignored invalid report user id: ${safeError && safeError.message || safeError}`);
        return void 0;
      }
    };
    const safeUserByUsername = async (username) => {
      const clean = String(username || "").replace(/^@/, "").trim();
      if (!clean) return void 0;
      try {
        return await t.getUserReader().getByUsername(clean);
      } catch (safeError) {
        this.reportApp.getLogger().warn(`Ignored invalid report username ${clean}: ${safeError && safeError.message || safeError}`);
        return void 0;
      }
    };
    let R = await safeUserById(u.userId) || await safeUserByUsername(u.username), P = await safeRoomById(u.sourceRoomId, "source"), O = P && this.reportApp.isPersonalReportRoom(P) ? P : void 0, B = await this.reportApp.getPublicReportRoom(t), L = await t.getUserReader().getByUsername("tars") || await t.getUserReader().getAppUser(), w = typeof u.workday == "string" && /^\d{4}-\d{2}-\d{2}$/.test(u.workday) ? u.workday : this.reportApp.reportWorkday(), ownerId = R && R.id || u.userId, E = this.reportApp.reportAssociation(ownerId, I, w), C = await t.getPersistenceReader().readByAssociation(E), A = C.filter((z) => z && z.userId === ownerId && z.reportType === I && z.workday === w).sort((z, latest) => Number(latest.updatedAt || 0) - Number(z.updatedAt || 0))[0], K = A && typeof A.messageId == "string" ? A.messageId : "", M = "", N = A && typeof A.publicMessageId == "string" ? A.publicMessageId : "", ownerSummaryMessageId = A && typeof A.ownerSummaryMessageId == "string" ? A.ownerSummaryMessageId : "", preliminaryMessageId = A && typeof A.preliminaryMessageId == "string" ? A.preliminaryMessageId : "";
    if (!O || !R)
      return this.response(
        T.HttpStatusCode.NOT_FOUND,
        false,
        !O ? "\u041D\u0435 \u043D\u0430\u0448\u0451\u043B \u043B\u0438\u0447\u043D\u044B\u0439 \u0447\u0430\u0442 \u043C\u0430\u0441\u0442\u0435\u0440\u0430. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0432\u0435\u0436\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u0438\u0437 \u0447\u0430\u0442\u0430 \u0422\u0430\u0440\u0441\u0430." : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u043C\u0430\u0441\u0442\u0435\u0440\u0430"
      );
    const receiptConfig = await this.reportApp.receiptOcrConfig(t);
    if (O) {
      try {
        await G.cleanupExpiredMasterRoom(O, R, t, s, receiptConfig, this.reportApp.getLogger());
      } catch (cleanupError) {
        this.reportApp.getLogger().warn(`Could not cleanup master room before report submit: ${cleanupError && cleanupError.message || cleanupError}`);
      }
    }
    const transferVerification = await G.confirmedTransferSummaryForUser(t, receiptConfig, ownerId, w), mailingProof = await this.reportApp.mailingProofStatus(t, R, w), reportPhoto = await this.reportApp.reportPhotoStatus(t, R, w), scheduleStatus = await this.reportApp.masterScheduleStatus(t, R, w), firstSubmittedAt = A && A.firstSubmittedAt ? Number(A.firstSubmittedAt) : Date.now(), timeCorrection = this.reportApp.reportTimeCorrection(firstSubmittedAt, scheduleStatus);
    const penalties = await this.reportApp.latenessSummary(t, ownerId, w);
    let cashSender = R;
    if (A && A.roomId && A.roomId !== O.id) K = "";
    try {
      K = await this.reportApp.sendReport(
        s,
        O,
        cashSender,
        h.rows,
        h.cash,
        h.transfers,
        I,
        K,
        transferVerification,
        R,
        h.mailings,
        mailingProof,
        timeCorrection,
        penalties,
        true
      );
      if (!K) throw new Error("пустой id сообщения отчёта");
    } catch (primaryError) {
      this.reportApp.getLogger().error(`Could not publish primary submitted report: ${primaryError && primaryError.message || primaryError}`);
      return this.response(T.HttpStatusCode.INTERNAL_SERVER_ERROR, false, `Не смог отправить отчёт в личный чат: ${primaryError && primaryError.message || primaryError}`);
    }
    ownerSummaryMessageId = await this.reportApp.sendOwnerShortReport(s, t, R, h.rows, h.cash, h.transfers, I, ownerSummaryMessageId, transferVerification, h.mailings, mailingProof, timeCorrection, penalties, true, w);
    if (B && L) {
      try {
        N = await this.reportApp.sendPublicClientSummary(
          s,
          B,
          L,
          h.rows,
          R,
          I,
          N
        );
      } catch (publicError) {
        this.reportApp.getLogger().warn(`Could not publish public client summary: ${publicError && publicError.message || publicError}`);
      }
    }
    let duplicateCleanup = { removed: 0, failed: 0 };
    if (A) {
      try {
        let cashCleanup = await this.reportApp.cleanupReportDuplicates(t, s, O, cashSender, I, w, K, R);
        duplicateCleanup.removed += cashCleanup.removed;
        duplicateCleanup.failed += cashCleanup.failed;
      } catch (cashCleanupError) {
        duplicateCleanup.failed += 1;
        this.reportApp.getLogger().warn(`Could not cleanup old cash report: ${cashCleanupError && cashCleanupError.message || cashCleanupError}`);
      }
    }
    try {
      if (Date.now() < this.reportApp.reportFinalDueAt(firstSubmittedAt, w)) {
        preliminaryMessageId = await this.reportApp.sendPreliminaryReportAnalysis(s, t, O, R, transferVerification, reportPhoto, mailingProof, this.reportApp.payrollRule(I, h.rows, h.mailings, mailingProof), preliminaryMessageId) || "";
      } else {
        await this.reportApp.deletePreliminaryReportAnalysis(s, t, preliminaryMessageId);
        preliminaryMessageId = "";
      }
    } catch (analysisError) {
      this.reportApp.getLogger().warn(`Report was published but preliminary analysis failed: ${analysisError && analysisError.message || analysisError}`);
    }
    try {
      await a.removeByAssociation(E);
      await a.createWithAssociation({
        userId: ownerId,
        reportType: I,
        workday: w,
        roomId: O.id,
        sourceRoomId: O.id,
        messageId: K,
        personalMessageId: "",
        publicMessageId: N,
        ownerSummaryMessageId,
        preliminaryMessageId,
        firstSubmittedAt,
        timeCorrection,
        scheduleStatus,
        formData: this.reportApp.submittedFormData(h),
        updatedAt: Date.now()
      }, E);
    } catch (stateError) {
      this.reportApp.getLogger().warn(`Report was published but state was not saved: ${stateError && stateError.message || stateError}`);
    }
    try {
      await this.reportApp.upsertReportFinalizeQueue(a, {
        userId: ownerId,
        username: R.username || "",
        reportType: I,
        workday: w,
        dueAt: this.reportApp.reportFinalDueAt(firstSubmittedAt, w),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    } catch (queueError) {
      this.reportApp.getLogger().warn(`Report was published but final queue was not updated: ${queueError && queueError.message || queueError}`);
    }
    if (O) {
      try {
        await this.reportApp.sendPersonalReportLink(t, s, a, O, R, I);
      } catch (z) {
        this.reportApp.getLogger().warn(`Could not refresh personal report button: ${z && z.message || z}`);
      }
    }
    return this.response(
      T.HttpStatusCode.OK,
      true,
      A ? duplicateCleanup.failed > 0 ? "\u041E\u0442\u0447\u0451\u0442 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0438 \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043D, \u043D\u043E \u043E\u0434\u043D\u0443 \u0438\u0437 \u0441\u0442\u0430\u0440\u044B\u0445 \u043A\u043E\u043F\u0438\u0439 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C" : "\u041E\u0442\u0447\u0451\u0442 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D: \u043D\u043E\u0432\u044B\u0439 \u0438\u0442\u043E\u0433 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D \u0432\u043D\u0438\u0437\u0443 \u043B\u0438\u0447\u043D\u043E\u0433\u043E \u0447\u0430\u0442\u0430" : "\u041E\u0442\u0447\u0451\u0442 \u043F\u0440\u0438\u043D\u044F\u0442. \u041F\u043E\u043B\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043E\u0441\u0442\u0430\u043B\u0438\u0441\u044C \u0432 \u043B\u0438\u0447\u043D\u043E\u043C \u0447\u0430\u0442\u0435; \u0432 #Otchet \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u044B \u0438 \u043E\u0446\u0435\u043D\u043A\u0430",
      {
        onTime: !(timeCorrection && timeCorrection.applied),
        late: !!(timeCorrection && timeCorrection.applied),
        warning: !!(timeCorrection && (timeCorrection.warning || timeCorrection.applied)),
        timingLabel: timeCorrection && timeCorrection.label || "👍 вовремя до 21:00"
      }
    );
  }
  parseContent(e) {
    if (typeof e != "string") return e || {};
    try {
      return JSON.parse(e);
    } catch (n) {
      return {};
    }
  }
  normalizeContent(e) {
    let n = this.parseContent(e), t = {}, s = (r) => {
      if (typeof r == "string")
        try {
          r = JSON.parse(r);
        } catch (a) {
          return null;
        }
      return r && typeof r == "object" && !Array.isArray(r) ? r : null;
    };
    if (n && typeof n == "object" && !Array.isArray(n)) {
      let body = s(n.body), content = s(n.content), r = s(n.formData), a = s(n.report), o = s(n.data), c = s(n.payload), d = s(n), m = [d, c, content, body, o, a, r].find((u) => u && Object.prototype.hasOwnProperty.call(u, "rows"));
      [r, a, o, body, content, c, d].forEach((u) => u && Object.assign(t, u));
      if (m) {
        Object.assign(t, m);
      }
    }
    if (typeof t.rows == "string")
      try {
        t.rows = JSON.parse(t.rows);
      } catch (r) {
      }
    return t.rows && typeof t.rows == "object" && !Array.isArray(t.rows) && (t.rows = Object.keys(t.rows).sort((r, a) => Number(r) - Number(a)).map((r) => t.rows[r])), t;
  }
  requestToken(e) {
    let n = e && e.query || {}, t = n && typeof n.token == "string" ? n.token.trim() : "";
    if (!t && e && typeof e.url == "string") {
      let s = /[?&]token=([^&]+)/.exec(e.url);
      if (s)
        try {
          t = decodeURIComponent(s[1]).trim();
        } catch (r) {
        }
    }
    return t;
  }
  dataResponse(e, n) {
    return this.json({
      status: e,
      headers: this.corsHeaders(),
      content: n
    });
  }
  response(e, n, t, extra = {}) {
    return this.json({
      status: e,
      headers: this.corsHeaders(),
      content: Object.assign({ ok: n, message: t }, extra || {})
    });
  }
  corsHeaders() {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    };
  }
};
// Final report form assets are precomputed to keep Rocket.Chat install/start faster.
var REPORT_FORM_HTML = "<!doctype html>\n<html lang=\"ru\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover\">\n  <meta name=\"color-scheme\" content=\"light\">\n  <title>GSNV Lab — отчёт мастера</title>\n  <style>\n    :root{--orange:#ff5a1f;--orange-dark:#e84b13;--ink:#222831;--muted:#68707c;--line:#dfe3e8;--soft:#f3f4f6;--ok:#168a4a;--bad:#c92a2a}\n    *{box-sizing:border-box}html{background:var(--soft)}body{margin:0;background:var(--soft);color:var(--ink);overflow-x:hidden;font:15px/1.35 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif}button,input{font:inherit}\n    .wrap{width:min(860px,100%);margin:0 auto;padding:18px 12px calc(36px + env(safe-area-inset-bottom))}.brand{display:flex;align-items:center;gap:10px;margin:2px 2px 15px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--orange);color:#fff;font-weight:900;letter-spacing:.04em}.brand strong{display:block;font-size:17px;letter-spacing:.04em}.brand span{color:var(--muted);font-size:12px}\n    .card{overflow:hidden;background:#fff;border:1px solid #e6e8ec;border-radius:20px;box-shadow:0 12px 34px rgba(29,34,43,.08)}.head{padding:10px 16px 9px;background:var(--orange);color:#1f242b;text-align:center;border-bottom:1px solid var(--orange-dark)}.head .eyebrow,.head .report-kind,.head #workday{display:none}h1{margin:0;color:#1f242b;font-size:20px;line-height:1.15}.date{margin:5px 0 0;color:#66301a;font-size:12px}.growth-line{margin:4px 0 0;color:#5c2712;font-size:12px;font-weight:900}.report-kind{font-weight:800;color:#7a2c10}\n    .status{display:none;margin:14px 14px 0;padding:11px 12px;border-radius:12px;font-weight:700}.status.show{display:block}.status.info{background:#fff3ec;color:#963b18}.status.ok{background:#e9f8ef;color:#126c3c}.status.bad{background:#fff0f0;color:#a61e1e}.body{padding:14px}.section-title{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:3px 2px 10px}.section-title h2{margin:0;font-size:16px}.section-title span{color:var(--muted);font-size:12px;text-align:right}\n    .rows{display:grid;gap:10px}.row{padding:12px;border:1px solid var(--line);border-radius:15px;background:#fff}.row-name{margin:0 0 9px;font-weight:800}.bonus-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bonus-grid .row{padding:0;border:0;background:transparent}.bonus-grid .row-name{margin:0 0 5px;color:var(--muted);font-size:13px;font-weight:800}.bonus-grid .fields{display:block}.bonus-grid label{gap:2px;font-size:11px;text-transform:none;letter-spacing:0}.bonus-grid .line-total{display:none}.row.sale{border-color:#ffd5c5;background:#fffaf7}.row.sale .row-name{color:#b53e12}.name-input{width:100%;margin:0 0 9px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;font-weight:700;background:#fff}.fields{display:grid;grid-template-columns:minmax(0,1fr) 86px 112px;gap:8px;align-items:end}.fields.female{grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr) 102px}\n    label{display:grid;gap:5px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}input[type=number]{width:100%;min-height:43px;padding:9px;border:1px solid #cfd4db;border-radius:10px;background:#fff;color:var(--ink);font-size:16px;font-weight:700;-moz-appearance:textfield}input::-webkit-inner-spin-button{display:none}input:focus{outline:3px solid rgba(255,90,31,.16);border-color:var(--orange)}.line-total{display:grid;min-height:43px;place-items:center;padding:8px;border-radius:10px;background:var(--soft);font-weight:900;white-space:nowrap}.tip-note{display:none}\n    .summary{margin-top:16px;padding:14px;border-radius:16px;background:#f7f8fa;border:1px solid var(--line)}.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.summary label{text-transform:none;font-size:13px;letter-spacing:0}.summary input{margin-top:2px}.totals{display:grid;gap:7px;margin-top:13px;padding-top:12px;border-top:1px solid var(--line)}.total-line{display:flex;justify-content:space-between;gap:12px}.total-line strong{font-size:16px}.difference.ok{color:var(--ok)}.difference.bad{color:var(--bad)}.deduction-info{color:var(--muted);font-size:13px}.deduction-info strong{font-size:13px;color:var(--ink)}.penalty-info{display:none;margin-top:2px;color:var(--muted);font-size:12px;line-height:1.25}.penalty-info.show{display:block}.penalty-info .penalty-row{display:flex;justify-content:space-between;gap:10px}.penalty-info strong{white-space:nowrap;color:var(--ink)}\n    .submit{width:100%;min-height:52px;margin-top:15px;border:0;border-radius:14px;background:var(--orange);color:#fff;font-size:17px;font-weight:900;box-shadow:0 8px 18px rgba(255,90,31,.25)}.submit:active{transform:translateY(1px);background:var(--orange-dark)}.submit:disabled{opacity:.55;box-shadow:none}.note{margin:10px 2px 0;color:var(--muted);font-size:12px;text-align:center}\n    @media(max-width:620px){body{font-size:13px}.wrap{padding:2px 3px calc(8px + env(safe-area-inset-bottom))}.brand{display:none}.card{border-radius:12px}.head{padding:7px 9px}h1{font-size:14px}.date{margin:2px 0 0;font-size:10px}.growth-line{margin:2px 0 0;font-size:10px}.report-kind{font-size:10px}.status{margin:7px 7px 0;padding:7px 8px;border-radius:9px;font-size:12px}.body{padding:5px}.section-title{margin:0 1px 5px;align-items:center}.section-title h2{font-size:13px}.section-title span{display:none}.rows{gap:4px}.row{padding:5px;border-radius:9px}.row-name{margin:0 0 4px;font-size:13px}.bonus-grid{grid-template-columns:1fr 1fr;gap:6px}.bonus-grid .row{padding:0;border-radius:0}.bonus-grid .row-name{margin:0 0 2px;font-size:11px}.bonus-grid label{font-size:8px}.bonus-grid input[type=number]{min-height:32px;font-size:16px}.bonus-grid .line-total{display:none}.name-input{min-height:34px;margin:0 0 4px;padding:5px 7px;border-radius:8px;font-size:16px}.fields{grid-template-columns:minmax(0,1fr) 44px 54px;gap:4px}.fields.female{grid-template-columns:minmax(0,1fr) 42px 56px 52px;gap:4px}label{gap:2px;font-size:8px;letter-spacing:.02em}input[type=number]{min-height:32px;padding:3px 5px;border-radius:8px;font-size:16px}.line-total{min-height:32px;padding:4px;border-radius:8px;font-size:12px}.summary{margin-top:7px;padding:8px;border-radius:11px}.summary-grid{grid-template-columns:1fr 1fr;gap:6px}.totals{gap:3px;margin-top:7px;padding-top:7px}.total-line strong{font-size:13px}.submit{min-height:42px;margin-top:8px;border-radius:10px;font-size:14px}.note{display:none}}\n  </style>\n</head>\n<body>\n  <div class=\"wrap\">\n    <div class=\"brand\"><div class=\"mark\">G</div><div><strong>GSNV LAB</strong><span>Технический контроль отчётов</span></div></div>\n    <section class=\"card\">\n      <header class=\"head\"><p class=\"eyebrow\">Отчёт дня</p><h1 id=\"title\">Спасибо за твой труд сегодня</h1><p class=\"growth-line\">Маленькие шаги приводят к большим результатам</p><p class=\"date report-kind\" id=\"reportKind\">Отчёт мастера</p><p class=\"date\" id=\"workday\">Загрузка данных…</p></header>\n      <div id=\"status\" class=\"status info\"></div>\n      <div class=\"body\">\n        <div class=\"section-title\"><h2>Услуги за день</h2><span>Заполняйте только выполненные позиции</span></div>\n        <form id=\"reportForm\" novalidate>\n          <div id=\"rows\" class=\"rows\"></div>\n          <section class=\"summary\">\n            <div class=\"summary-grid\">\n              <label>Наличные, ₽<input id=\"cash\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"decimal\" placeholder=\"0\"></label>\n              <label>Чеки / переводы, ₽<input id=\"transfers\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"decimal\" placeholder=\"0\"></label>\n            </div>\n            <div class=\"totals\">\n              <div class=\"total-line\"><span>Общая выручка</span><strong id=\"revenue\">0 ₽</strong></div>\n              <div class=\"total-line\"><span>Указано в кассе</span><strong id=\"payments\">0 ₽</strong></div>\n              <div id=\"differenceLine\" class=\"total-line difference ok\"><span id=\"differenceLabel\">Совпало</span><strong id=\"difference\">0 ₽</strong></div><div id=\"expenseLine\" class=\"total-line deduction-info\" style=\"display:none\"><span>Расходы</span><strong id=\"expenseTotal\">0 ₽</strong></div><div id=\"netRevenueLine\" class=\"total-line deduction-info\" style=\"display:none\"><span>Итого</span><strong id=\"netRevenue\">0 ₽</strong></div>\n            </div>\n          </section>\n          <button id=\"submit\" class=\"submit\" type=\"submit\">ОТПРАВИТЬ ОТЧЁТ</button>\n          <p class=\"note\">При исправлении старый отчёт будет заменён, а все суммы пересчитаны.</p>\n        </form>\n      </div>\n    </section>\n  </div>\n  <script defer src=\"/api/apps/public/4c07ba1e-e87d-4d85-9e76-7d818d567439/report-form-script-09198?v=0.9.344\"></script>\n</body>\n</html>\n";
var REPORT_FORM_SCRIPT = "(()=>{\n    const TYPES={\n      male:{title:'Мужской отчёт',rows:[['Стрижка'],['Борода'],['Окрашивание',0,0,0,1],['Другая услуга',1],['Продажа 200 ₽',0,1],['Чай переводом',0,0,1]]},\n      female:{title:'Отчёт женского мастера',rows:[['Женская стрижка'],['Укладка'],['Простое окрашивание',0,0,0,1],['Простое окрашивание',0,0,0,1],['Сложное окрашивание',0,0,0,1],['Сложное окрашивание',0,0,0,1],['Уход за волосами',0,0,0,1],['Продажа 200 ₽',0,1],['Чай переводом',0,0,1],['Другая услуга',1,0,0,1]]},\n      brow:{title:'Отчёт бровиста',rows:[['Архитектура + окрашивание'],['Архитектура'],['Долговременная укладка'],['Мужские брови'],['Окрашивание ресниц'],['Осветление бровей'],['Чай переводом',0,0,1],['Пустая строка',1]]},\n      manicure:{title:'Отчёт мастера маникюра',rows:[['Маникюр без покрытия'],['Маникюр с покрытием'],['Маникюр с укреплением'],['Наращивание ногтей'],['Педикюр без покрытия без стопы'],['Педикюр с покрытием без стопы'],['Педикюр без покрытия со стопой'],['Педикюр с покрытием со стопой'],['Ремонт'],['Дизайн'],['Снятие чужой работы'],['Чай переводом',0,0,1],['Пустая строка',1]]}\n    };\n    const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),token=params.get('token')||'',demo=params.get('demo')||'';\n    const apiPath='/api/apps/public/4c07ba1e-e87d-4d85-9e76-7d818d567439/submit-report';\n    let reportType=demo&&TYPES[demo]?demo:'male';\n    const num=v=>{const n=Number(String(v??'').replace(/\\s/g,'').replace(',','.'));return Number.isFinite(n)&&n>=0?n:0};\n    const money=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(Math.round((v+Number.EPSILON)*100)/100)+' ₽';\n    const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',\"'\":'&#39;','\"':'&quot;'}[c]));\n    function status(text,kind='info'){const el=$('status');el.textContent=text;el.className='status show '+kind}function showAccepted(data){const late=!!(data&&data.late),warning=!!(data&&data.warning),strict=late||warning;let el=$('acceptedOverlay');if(!el){el=document.createElement('div');el.id='acceptedOverlay';document.body.appendChild(el)}const styles='<style id=\"acceptedStyles\">#acceptedOverlay{position:fixed;inset:0;z-index:9999;background:linear-gradient(180deg,rgba(255,255,255,.985),rgba(255,248,244,.995));padding:max(10px,env(safe-area-inset-top)) 10px max(12px,env(safe-area-inset-bottom));display:grid;place-items:center;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace}#acceptedCard{width:min(520px,calc(100vw - 28px));min-height:min(620px,calc(100vh - 48px));border:2px solid rgba(255,90,31,.58);border-radius:30px;background:linear-gradient(180deg,#fffefa,#fff7f0);box-shadow:0 24px 58px rgba(255,90,31,.13);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#20242b;padding:24px 20px;box-sizing:border-box}#acceptedMark{display:grid;place-items:center;width:118px;height:118px;border-radius:28px;background:#ff5a1f;color:#fff;font-size:30px;font-weight:900;letter-spacing:.08em;box-shadow:0 18px 38px rgba(255,90,31,.24);margin:0 auto 24px}#acceptedText{max-width:440px;color:#e95819;font-size:clamp(31px,7.2vw,48px);font-weight:900;line-height:1.14;margin:0 auto 18px}#acceptedSubtext{display:none;color:#7a3a1f;font-size:clamp(15px,3.4vw,18px);font-weight:800;line-height:1.25;margin:-6px auto 18px}#acceptedReminder{color:#1f242b;font-size:clamp(13px,3.2vw,16px);font-weight:900;letter-spacing:.3px;opacity:.92}@media(max-height:680px){#acceptedCard{min-height:calc(100vh - 24px);padding:16px 18px}#acceptedMark{width:88px;height:88px;border-radius:22px;font-size:22px;margin-bottom:16px}#acceptedText{font-size:30px}}</style>';el.innerHTML=styles+'<div id=\"acceptedCard\"><div id=\"acceptedMark\">TARS</div><div id=\"acceptedText\">'+(late?'Отчёт принят с опозданием':warning?'Отчёт принят после 20:15':'Спасибо за вовремя присланный отчет')+'</div><div id=\"acceptedSubtext\" style=\"display:'+(strict?'block':'none')+'\">'+(late?'Постарайся завтра отправить вовремя.':'До 21:00 вычета нет, но проверь фото, чеки и рассылки.')+'</div><div id=\"acceptedReminder\">tars проверит фото, чеки и рассылки</div></div>';try{window.scrollTo(0,0)}catch(_scrollError){}}\n    function readableError(err,fallback){const text=String(err&&err.message||err||fallback||'Ошибка');if(/expected pattern|string did not match|pattern/i.test(text))return 'Не удалось отправить отчёт. Нажмите «Заполнить» в чате ещё раз.';if(/Откройте новую таблицу|Ссылка устарела/i.test(text))return text;return 'Не удалось отправить отчёт: '+text}\n    function paymentFieldsReady(){const cashEl=$('cash'),transfersEl=$('transfers'),cashRaw=String(cashEl&&cashEl.value||'').trim(),transfersRaw=String(transfersEl&&transfersEl.value||'').trim(),toAmount=v=>Number(String(v).replace(/\\s/g,'').replace(',','.'));if(cashRaw===''||transfersRaw===''){status('Заполните наличные и чеки / переводы. Если суммы нет — поставьте 0.','bad');try{(cashRaw===''?cashEl:transfersEl).focus()}catch(_focusError){}return false}const cash=toAmount(cashRaw),transfers=toAmount(transfersRaw);if(!Number.isFinite(cash)||cash<0||!Number.isFinite(transfers)||transfers<0){status('Введите наличные и чеки / переводы цифрами.','bad');try{(!Number.isFinite(cash)||cash<0?cashEl:transfersEl).focus()}catch(_focusError){}return false}return true}function specs(type){return TYPES[type].rows.map((r,i)=>({key:i,name:r[0],custom:!!r[1],sale:!!r[2],tip:!!r[3],hasExpense:!!r[4]}))}\n    function bindSaved(type,saved){const base=specs(type),used=new Set,norm=v=>String(v||'').trim().toLowerCase(),isTipRow=r=>r&&(r.tip===true||norm(r.name).startsWith('чай')),isSaleRow=r=>r&&(r.sale===true||norm(r.name).startsWith('продажа'));return base.map(spec=>{let found=-1,specName=norm(spec.name);for(let i=0;i<saved.length;i++){if(used.has(i))continue;const row=saved[i],rowName=norm(row.name);if(spec.tip?isTipRow(row):spec.sale?isSaleRow(row):rowName===specName){found=i;break}}if(found<0&&spec.custom){for(let i=0;i<saved.length;i++){if(used.has(i))continue;const row=saved[i];if(isTipRow(row)||isSaleRow(row))continue;found=i;break}}if(found>=0){used.add(found);const merged={...spec,...saved[found]};merged.sale=!!spec.sale;merged.tip=!!spec.tip;merged.hasExpense=!!spec.hasExpense;if(!spec.custom)merged.name=spec.name;merged.custom=spec.custom||(!spec.tip&&!spec.sale&&norm(saved[found].name)!==specName);return merged}return spec})}\n    function render(type,saved=[]){reportType=TYPES[type]?type:'male';const cfg=TYPES[reportType];$('title').textContent='Спасибо за твой труд сегодня';$('reportKind').textContent=cfg.title;$('rows').innerHTML=(()=>{const rowHtml=(r,i)=>{const sale=!!r.sale,tip=!!r.tip,expense=!!r.hasExpense&&!sale&&!tip,name=r.name||'';return `<article class=\"row${sale||tip?' sale':''}\" data-i=\"${i}\" data-sale=\"${sale?1:0}\" data-tip=\"${tip?1:0}\">${r.custom?`<input class=\"name-input\" data-field=\"name\" maxlength=\"60\" placeholder=\"Название услуги\" value=\"${esc(name)}\">`:`<p class=\"row-name\">${esc(name)}</p><input type=\"hidden\" data-field=\"name\" value=\"${esc(name)}\">`}<div class=\"fields${expense?' female':''}\">${sale?`<label>Кол.<input data-field=\"quantity\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"numeric\" placeholder=\"0\" value=\"${r.quantity||''}\"></label><input data-field=\"price\" type=\"hidden\" value=\"200\">`:`<label>${tip?'Сумма перевода':'Цена, ₽'}<input data-field=\"price\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"decimal\" placeholder=\"0\" value=\"${r.price||''}\"></label>${tip?'':`<label>Кол.<input data-field=\"quantity\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"numeric\" placeholder=\"0\" value=\"${r.quantity||''}\"></label>`}`}${expense?`<label>Расход, ₽<input data-field=\"expense\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"decimal\" placeholder=\"0\" value=\"${r.expense??''}\"></label>`:''}<div class=\"line-total\">0 ₽</div></div></article>`};const bound=bindSaved(reportType,saved),out=[];for(let i=0;i<bound.length;i++){if(bound[i]&&bound[i].sale&&bound[i+1]&&bound[i+1].tip){out.push(`<div class=\"bonus-grid\">${rowHtml(bound[i],i)}${rowHtml(bound[i+1],i+1)}</div>`);i++;}else out.push(rowHtml(bound[i],i));}return out.join('')})();document.querySelectorAll('input').forEach(el=>el.addEventListener('input',recalc));recalc()}\n    function collect(includeEmpty=false){return [...document.querySelectorAll('.row')].map(row=>{const get=f=>row.querySelector(`[data-field=\"${f}\"]`)?.value??'',sale=row.dataset.sale==='1',tip=row.dataset.tip==='1',price=num(get('price')),quantity=tip?1:num(get('quantity')),expenseRaw=String(get('expense')).trim(),expense=sale||tip?0:(expenseRaw===''?'':num(expenseRaw)),name=(get('name')||row.querySelector('.row-name')?.textContent||'').replace(/ · 100%$/,'').trim();return {name,price,quantity,sale,tip,expense,_filled:!!name&&price>0&&(tip||quantity>0)}}).filter(r=>includeEmpty||r._filled).map(({_filled,...r})=>r)}\n    function recalc(){let revenue=0,expenseDeductions=0,teaDeductions=0;[...document.querySelectorAll('.row')].forEach(row=>{const sale=row.dataset.sale==='1',tip=row.dataset.tip==='1',price=num(row.querySelector('[data-field=\"price\"]')?.value),qty=tip?1:num(row.querySelector('[data-field=\"quantity\"]')?.value),expenseInput=row.querySelector('[data-field=\"expense\"]'),expenseRaw=expenseInput?String(expenseInput.value||'').trim():'',rowName=String(row.querySelector('[data-field=\"name\"]')?.value||row.querySelector('.row-name')?.textContent||'').toLowerCase().replace(/ё/g,'е'),expense=sale||tip?0:expenseRaw?num(expenseRaw):reportType==='male'&&rowName.indexOf('окраш')!==-1?400*qty:0,total=price*qty;let displayTotal=Math.max(0,total-Math.min(expense,total));if(expense>0)expenseDeductions+=Math.min(expense,total);if(tip){const deduction=total>0?Math.min(50,total):0,salary=Math.max(total-deduction,0),note=row.querySelector('.tip-note');displayTotal=salary;teaDeductions+=deduction;if(note)note.textContent='Чай переводом '+money(total)}row.querySelector('.line-total').textContent=money(displayTotal);revenue+=total});const payments=num($('cash').value)+num($('transfers').value),diff=payments-revenue;$('revenue').textContent=money(revenue);$('payments').textContent=money(payments);$('difference').textContent=money(Math.abs(diff));const line=$('differenceLine');line.className='total-line difference '+(Math.abs(diff)<.005?'ok':'bad');$('differenceLabel').textContent=Math.abs(diff)<.005?'Совпало':diff<0?'Недостача':'Излишек';const totalDeductions=expenseDeductions+teaDeductions,netRevenue=Math.max(0,revenue-totalDeductions),expenseLine=$('expenseLine'),expenseText=$('expenseTotal'),netLine=$('netRevenueLine'),netText=$('netRevenue');if(expenseLine){expenseLine.style.display=expenseDeductions>0?'flex':'none';if(expenseText)expenseText.textContent='-'+money(expenseDeductions)}if(netLine){netLine.style.display=totalDeductions>0?'flex':'none';if(netText)netText.textContent=money(netRevenue)}}\n    async function load(){if(!token){$('workday').textContent='Демонстрация формы';render(reportType);status('Форма перенесена на домен GSNV Lab. Для отправки откройте её из чата Тарса.','info');return}try{const res=await fetch(apiPath+'?token='+encodeURIComponent(token),{cache:'no-store'}),data=await res.json();if(!res.ok||!data.ok)throw new Error(data.message||'Не удалось открыть таблицу');reportType=data.reportType||'male';const saved=data.formData?.rows||data.rows||[];$('workday').textContent='Рабочий день: '+(data.workday||'сегодня');$('cash').value=data.formData?.cash??data.cash??'';$('transfers').value=data.formData?.transfers??data.transfers??'';render(reportType,saved);if(data.existing)status('Сохранённый отчёт загружен. После изменения все итоги пересчитаются.','info')}catch(err){$('workday').textContent='Таблица недоступна';render(reportType);status(readableError(err,'Не удалось открыть таблицу'),'bad');$('submit').disabled=true}}\n    async function postReport(payload){const body=JSON.stringify(payload),url=apiPath+'?token='+encodeURIComponent(payload.token||'');const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body});const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch(_json){if(res.ok)return {ok:true,message:'Отчёт принят. Проверьте итог в этом чате.'};throw new Error('Сервер вернул непонятный ответ. Проверьте этот чат и откройте свежую ссылку.')}if(res.ok&&data&&data.ok)return data;throw new Error(data&&data.message||'Отчёт не отправлен')}\n    $('reportForm').addEventListener('submit',async e=>{e.preventDefault();let rows=collect();if(!rows.length)rows=collect(true);if(!token){status('Откройте персональную таблицу из чата Тарса.','bad');return}if(!paymentFieldsReady())return;if(!rows.length){status('Заполните хотя бы одну услугу или продажу.','bad');return}const btn=$('submit');btn.disabled=true;btn.textContent='ОТПРАВЛЯЮ…';try{const data=await postReport({token,rows,cash:num($('cash').value),transfers:num($('transfers').value)});showAccepted(data)}catch(err){status(readableError(err,'Отчёт не отправлен'),'bad');try{window.scrollTo(0,0)}catch(_scrollError){}}finally{btn.disabled=false;btn.textContent='ОТПРАВИТЬ ОТЧЁТ'}});\n    load();\n  })();";
var REPORT_ON_TIME_IMAGE_DATA = "data:image/jpeg;base64,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";
var REPORT_LATE_IMAGE_DATA = "data:image/jpeg;base64,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";
var REPORT_ON_TIME_SUCCESS_OVERRIDE = `
    showAccepted = function(data) {
      const late = !!(data && data.late);
      let el = document.getElementById("acceptedOverlay");
      if (!el) {
        el = document.createElement("div");
        el.id = "acceptedOverlay";
        document.body.appendChild(el);
      }
      const styles = '<style id="acceptedStyles">#acceptedOverlay{position:fixed;inset:0;z-index:9999;background:#050505;padding:0;display:grid;place-items:center;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}#acceptedCard{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;box-sizing:border-box}#acceptedImage{display:block;width:100%;height:100%;object-fit:contain;background:#050505}#acceptedMark{display:grid;place-items:center;width:118px;height:118px;border-radius:28px;background:#ff5a1f;color:#fff;font-size:30px;font-weight:900;letter-spacing:.08em;box-shadow:0 18px 38px rgba(255,90,31,.24);margin:0 auto 24px}#acceptedText{max-width:440px;color:#e95819;font-size:clamp(31px,7.2vw,48px);font-weight:900;line-height:1.14;margin:0 auto 18px}#acceptedSubtext{color:#fff;font-size:clamp(15px,3.4vw,18px);font-weight:800;line-height:1.25;margin:-6px auto 18px}#acceptedReminder{color:#fff;font-size:clamp(13px,3.2vw,16px);font-weight:900;letter-spacing:.3px;opacity:.92}</style>';
      if (!late) {
        el.innerHTML = styles + '<div id="acceptedCard"><img id="acceptedImage" src="${REPORT_ON_TIME_IMAGE_DATA}" alt="Спасибо! Отчёт принят вовремя. TARS проверит фото, переводы и рассылки"></div>';
      } else {
        el.innerHTML = styles + '<div id="acceptedCard"><img id="acceptedImage" src="${REPORT_LATE_IMAGE_DATA}" alt="Отчёт принят с опозданием. Завтра постарайся вовремя"></div>';
      }
      try { window.scrollTo(0, 0); } catch (_scrollError) {}
    };
`;
REPORT_FORM_SCRIPT = REPORT_FORM_SCRIPT.replace("\n    load();\n  })();", REPORT_ON_TIME_SUCCESS_OVERRIDE + "\n    load();\n  })();");
var ReportFormEndpoint = class extends A.ApiEndpoint {
  constructor(e) {
    super(e);
    this.path = "report-form";
  }
  async get() {
    return {
      status: T.HttpStatusCode.OK,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      content: REPORT_FORM_HTML
    };
  }
};
var ReportFormScriptEndpoint = class extends A.ApiEndpoint {
  constructor(e) {
    super(e);
    this.path = "report-form-script-09198";
  }
  async get() {
    return {
      status: T.HttpStatusCode.OK,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      content: REPORT_FORM_SCRIPT
    };
  }
};
var E = class {
  constructor(e) {
    this.app = e, this.command = "otchet", this.i18nParamsExample = "report_command_params", this.i18nDescription = "report_command_description", this.providesPreview = false;
  }
  async executor(e, n, t, s, r) {
    let a = e.getArguments().map((o) => String(o).toLowerCase()), c = a.indexOf("profil") !== -1 || a.indexOf("profile") !== -1 || a.indexOf("профиль") !== -1;
    await this.app.handleReportCommand(n, t, r, e.getRoom(), e.getSender(), c);
  }
};
var ArchiveReceiptCommand = class {
  constructor(e) {
    this.app = e, this.command = "cheki", this.i18nParamsExample = "receipt_archive_command_params", this.i18nDescription = "receipt_archive_command_description", this.providesPreview = false;
  }
  async executor(e, n, t, s, r) {
    await this.app.handleReceiptArchiveCommand(n, t, r, e.getRoom(), e.getSender(), e.getArguments());
  }
};
var ApproveReceiptCommand = class {
  constructor(e) {
    this.app = e, this.command = "prinyat", this.i18nParamsExample = "approve_receipt_command_params", this.i18nDescription = "approve_receipt_command_description", this.providesPreview = false;
  }
  async executor(e, n, t, s, r) {
    await this.app.handleApproveReceiptCommand(n, t, r, e.getRoom(), e.getSender(), e.getArguments());
  }
};
var ScheduleCommand = class {
  constructor(e) {
    this.app = e, this.command = "grafik", this.i18nParamsExample = "schedule_command_params", this.i18nDescription = "schedule_command_description", this.providesPreview = false;
  }
  async executor(e, n, t, s, r) {
    await this.app.handleScheduleCommand(n, t, r, e.getRoom(), e.getSender(), e.getArguments());
  }
};
var MasterChatCommand = class {
  constructor(e) {
    this.app = e, this.command = "tarschat", this.i18nParamsExample = "master_chat_command_params", this.i18nDescription = "master_chat_command_description", this.providesPreview = false;
  }
  async executor(e, n, t, s, r) {
    await this.app.handleMasterChatCommand(n, t, r, e.getRoom(), e.getSender(), e.getArguments());
  }
};
var LatenessCommand = class {
  constructor(e, n) {
    this.app = e, this.command = n || "opozdanie", this.i18nParamsExample = "lateness_command_params", this.i18nDescription = "lateness_command_description", this.providesPreview = false;
  }
  async executor(e, n, t, s, r) {
    await this.app.handleLatenessCommand(n, t, r, e.getRoom(), e.getSender(), e.getArguments());
  }
};
/*! Bundled license information:

js-sha256/src/sha256.js:
  (**
   * [js-sha256]{@link https://github.com/emn178/js-sha256}
   *
   * @version 0.11.1
   * @author Chen, Yi-Cyuan [emn178@gmail.com]
   * @copyright Chen, Yi-Cyuan 2014-2025
   * @license MIT
   *)
*/
