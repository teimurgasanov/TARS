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
      else if (/pending|processing|ожидан|обработ/.test(status)) statusRejection = "🚫 СТАТУС ЧЕКА НЕ ПОДТВЕРЖДЁН";
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
    async function requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, retryAttempt = 0) {
      if (!config || !config.openaiApiKey || !content || !content.length) return void 0;
      const model = String(config.openaiReceiptModel || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
      const imageUrl = `data:${receiptImageMimeType(file)};base64,${bytesToBase64(content)}`;
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
                  text: "Ты проверяешь фото банковского чека салона. Верни только JSON без Markdown: {\"is_receipt\":boolean,\"has_readable_text\":boolean,\"visual_type\":\"bank_receipt|bank_app_screen|receipt_on_phone|qr_payment_receipt|mailing_proof_screenshot|hair_work_photo|nails_work_photo|brows_lashes_work_photo|pedicure_work_photo|work_photo|salon_photo|chat_screenshot|unknown\",\"is_mailing_proof\":boolean,\"service_type\":\"haircut|coloring|manicure|pedicure|brows|lashes|unknown\",\"is_screenshot_of_chat\":boolean,\"date\":\"YYYY-MM-DD|null\",\"amount\":number|null,\"status\":\"success|failed|pending|unknown\",\"bank\":\"string|null\"}. Визуальные типы чеков: PDF/белый банковский чек с логотипом банка; экран приложения банка с квитанцией; фото телефона, на котором открыт чек; QR/СБП чек; справка по операции. Визуальный тип mailing_proof_screenshot: скрин Instagram/Direct/личных сообщений со списком получателей и статусами Отправлено, Просмотрено, Sent, Seen, Delivered, либо текстом что аккаунт не может получать сообщения. Такой скрин всегда is_receipt=false и is_mailing_proof=true, это не фото работы. Визуальные типы фото работ: человек после стрижки, укладки или окрашивания = hair_work_photo; волосы крупным планом = hair_work_photo; руки/ногти/маникюр = nails_work_photo; стопы/педикюр = pedicure_work_photo; брови/ресницы/лицо крупно = brows_lashes_work_photo; интерьер салона без чека = salon_photo, это не фото выполненной работы для Otchet. is_receipt=true только если это банковский чек, квитанция, справка по операции, перевод или платеж российского банка/платежного сервиса: Сбер, Т-Банк/Тинькофф, ВТБ, Альфа, Газпромбанк, Райффайзен, Открытие, Росбанк, ПСБ, МКБ, МТС Банк, Почта Банк, Совкомбанк/Халва, Россельхозбанк, ОЗОН Банк, Уралсиб, Ак Барс, Русский Стандарт, Дом.РФ, ЮMoney, СБП/QR. Фото человека, волос, результата работы, маникюра, педикюра, бровей, ресниц или салона всегда is_receipt=false, даже если на фоне есть текст, вывеска или логотип. Не выдумывай дату или сумму. Если видишь 17.08.2026, это 2026-08-17, не 2016. Сумма - итог операции/перевода/платежа в рублях: строки ИТОГО, Сумма, Сумма операции, Сумма перевода, Сумма платежа, Сумма списания, Сумма с учетом комиссии или Сумма в валюте операции. Если видишь 1 800 RUR, 1800 RUR, 1 800 RUB, 1 800 ₽, 1 800 руб, 600 ₽, 600 Р или 600 P, amount=1800 для 1 800 и amount=600 для 600. RUR, RUB, ₽, Р и руб - это рубли. Не бери комиссию, батарею, время, номер карты, номер квитанции, адрес, телефон, код подтверждения или баланс как сумму. status=success только для Успешно, Исполнен, Исполнено, Выполнен, Оплачен, Completed, Success. status=pending для Ожидает подтверждения, В обработке, На обработке, На подпись, На подписании, К отправке, Готов к отправке, Черновик, Картотека, В дневной очереди, Поставлен в рейс, Отправлен, request_sent, created, sending, timeout, processing, pending."
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
          return requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, retryAttempt + 1);
        }
        throw networkError;
      }
      if (!response || response.statusCode < 2e2 || response.statusCode >= 3e2) {
        if (response && (response.statusCode >= 500 || response.statusCode === 429) && retryAttempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          return requestOpenAiReceiptCheck(file, content, http, config, requiredDate, logger, retryAttempt + 1);
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
      if (/ожидает\s+(?:подтверждения|обработки|исполнения)|в\s+обработке|на\s+обработке|на\s+проверке|на\s+подпис(?:ь|ании)|к\s+отправке|готов\s+к\s+отправке|черновик|картотек|дневн\w*\s+очеред|поставлен\s+в\s+рейс|отправлен|платеж\s+(?:создан|обрабатывается)|request_sent|created|sending|timeout|processing|pending/i.test(source)) {
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
    async function confirmedTransferSummaryForUser(read, config, userId, targetDate, nameCandidates) {
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
      return { count, total: Math.round(total * 100) / 100, missing };
    }
    function masterTransferSummaryAssociation(userId, targetDate) {
      return new RocketChatAssociationRecord(
        RocketChatAssociationModel.MISC,
        `receipt-transfer-summary:${targetDate}:${userId}`
      );
    }
    async function publishMasterTransferSummary(entry, message, read, persistence, modify, config, logger) {
      const userId = String(entry && entry.userId || "");
      const nameCandidates = entry && Array.isArray(entry.nameCandidates) ? entry.nameCandidates : [];
      const associationKey = userId || "name:" + transferNameKey(entry && (entry.username || entry.userName || nameCandidates[0]) || "");
      if (!associationKey || associationKey === "name:") return false;
      const targetDate = String(entry && entry.receiptDate || expectedReceiptDate(config));
      const room = message && isPersonalTarsRoom(message.room) ? message.room : await findResultRoom(read, config);
      const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
      if (!room || !appUser) return false;
      const summary = await confirmedTransferSummaryForUser(read, config, userId, targetDate, nameCandidates);
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
      let text = `💳 СУММА ПЕРЕВОДОВ\nМастер: ${username}\nДата: ${displayDate(targetDate)}\nЧеков: ${summary.count}\nСумма переводов: ${amountText} ₽`;
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
