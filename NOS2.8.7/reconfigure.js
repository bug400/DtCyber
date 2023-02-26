#!/usr/bin/env node

const DtCyber   = require("../automation/DtCyber");
const fs        = require("fs");
const utilities = require("./opt/utilities");

const dtc = new DtCyber();

let newHostID      = null;     // new network host identifier
let newMID         = null;     // new machine identifer
let oldHostID      = "NCCM01"; // old network host identifier
let oldMID         = "01";     // old machine identifer
let productRecords = [];       // textual records to edit into PRODUCT file

const customProps  = utilities.getCustomProperties(dtc);
const iniProps     = utilities.getIniProperties(dtc);

let oldCrsInfo = {
  lid:       "COS",
  channel:   -1,
  stationId: "FE",
  crayId:    "C1"
};
let newCrsInfo = {};

/*
 * processCmrdProps
 *
 * Process properties defined in CMRDECK sections of property files.
 *
 * Returns:
 *  A promise that is resolved when all CMRD properties have been processed.
 *  The global array productRecords is updated to include the CMRD record
 *  to be edited into the PRODUCT file, if any.
 */
const processCmrdProps = () => {
  if (typeof customProps["CMRDECK"] !== "undefined") {
    return dtc.say("Edit CMRD01 ...")
    .then(() => utilities.getSystemRecord(dtc, "CMRD01"))
    .then(cmrd01 => {
      for (const prop of customProps["CMRDECK"]) {
        let ei = prop.indexOf("=");
        if (ei < 0) {
          throw new Error(`Invalid CMRDECK definition: \"${prop}\"`);
        }
        let key   = prop.substring(0, ei).trim().toUpperCase();
        let value = prop.substring(ei + 1).trim().toUpperCase();
        if (value.endsWith(".")) value = value.substring(0, value.length - 1).trim();
        let si = 0;
        while (si < cmrd01.length) {
          let ni = cmrd01.indexOf("\n", si);
          if (ni < 0) ni = cmrd01.length - 1;
          let ei = cmrd01.indexOf("=", si);
          if (ei < ni && ei > 0 && cmrd01.substring(si, ei).trim() === key) {
            if (key === "MID") {
              newMID = value;
              oldMID = cmrd01.substring(ei + 1, ni).trim();
              if (oldMID.endsWith(".")) oldMID = oldMID.substring(0, oldMID.length - 1).trim();
            }
            cmrd01 = `${cmrd01.substring(0, si)}${key}=${value}.\n${cmrd01.substring(ni + 1)}`;
            break;
          }
          si = ni + 1;
        }
        if (si >= cmrd01.length) {
          cmrd01 += `${key}=${value}\n`;
        }
      }
      productRecords.push(cmrd01);
      return Promise.resolve();
    });
  }
  else {
    return Promise.resolve();
  }
};

/*
 * processEqpdProps
 *
 * Process properties defined in EQPDECK sections of property files.
 *
 * Returns:
 *  A promise that is resolved when all EQPD properties have been processed.
 *  The global array productRecords is updated to include the EQPD record
 *  to be edited into the PRODUCT file, if any.
 */
const processEqpdProps = () => {
  if (typeof customProps["EQPDECK"] !== "undefined") {
    return dtc.say("Edit EQPD01 ...")
    .then(() => utilities.getSystemRecord(dtc, "EQPD01"))
    .then(eqpd01 => {
      for (const prop of customProps["EQPDECK"]) {
        let ei = prop.indexOf("=");
        if (ei < 0) {
          throw new Error(`Invalid EQPDECK definition: \"${prop}\"`);
        }
        let key   = prop.substring(0, ei).trim().toUpperCase();
        let value = prop.substring(ei + 1).trim().toUpperCase();
        let si = 0;
        let isEQyet = false;
        let isPFyet = false;
        while (si < eqpd01.length) {
          let ni = eqpd01.indexOf("\n", si);
          if (ni < 0) ni = eqpd01.length - 1;
          let ei = eqpd01.indexOf("=", si);
          if (ei < ni && ei > 0) {
            let eqpdKey = eqpd01.substring(si, ei).trim();
            if (eqpdKey.startsWith("EQ")) {
              isEQyet = true;
            }
            if (eqpdKey === "PF") {
              isPFyet = true;
            }
            if (eqpdKey === key) {
              if (key === "PF") {
                let ci = value.indexOf(",");
                if (ci < 0) {
                  throw new Error(`Invalid EQPDECK definition: \"${prop}\"`);
                }
                let propPFN = parseInt(value.substring(0, ci).trim());
                ci = eqpd01.indexOf(",", ei + 1);
                let eqpdPFN = parseInt(eqpd01.substring(ei + 1, ci).trim());
                if (propPFN === eqpdPFN) {
                  eqpd01 = `${eqpd01.substring(0, si)}${key}=${value}\n${eqpd01.substring(ni + 1)}`;
                  break;
                }
                else if (propPFN < eqpdPFN) {
                  eqpd01 = `${eqpd01.substring(0, si)}${key}=${value}\n${eqpd01.substring(si)}`;
                  break;
                }
              }
              else {
                eqpd01 = `${eqpd01.substring(0, si)}${key}=${value}\n${eqpd01.substring(ni + 1)}`;
                break;
              }
            }
            else if (isEQyet && key.startsWith("EQ") && !eqpdKey.startsWith("*")) {
              if (!eqpdKey.startsWith("EQ")
                  || parseInt(key.substring(2)) < parseInt(eqpdKey.substring(2))) {
                eqpd01 = `${eqpd01.substring(0, si)}${key}=${value}\n${eqpd01.substring(si)}`;
                break;
              }
            }
            else if (isPFyet && key === "PF" && !eqpdKey.startsWith("*") && eqpdKey !== "REMOVE") {
              eqpd01 = `${eqpd01.substring(0, si)}${key}=${value}\n${eqpd01.substring(si)}`;
              break;
            }
          }
          si = ni + 1;
        }
        if (si >= eqpd01.length) {
          eqpd01 += `${key}=${value}\n`;
        }
      }
      productRecords.push(eqpd01);
      return Promise.resolve();
    });
  }
  else {
    return Promise.resolve();
  }
};

/*
 * processNetworkProps
 *
 * Process properties defined in NETWORK sections of property files.
 *
 * Returns:
 *  A promise that is resolved when all NETWORK properties have been processed.
 */
const processNetworkProps = () => {
  for (const line of iniProps["npu.nos287"]) {
    let ei = line.indexOf("=");
    if (ei < 0) continue;
    let key   = line.substring(0, ei).trim().toUpperCase();
    let value = line.substring(ei + 1).trim();
    if (key === "HOSTID") {
      oldHostID = value.toUpperCase();
    }
  }
  if (typeof iniProps["sysinfo"] !== "undefined") {
    for (const line of iniProps["sysinfo"]) {
      let ei = line.indexOf("=");
      if (ei < 0) continue;
      let key   = line.substring(0, ei).trim().toUpperCase();
      let value = line.substring(ei + 1).trim();
      if (key === "CRS") {
        let items = value.split(",");
        oldCrsInfo.lid       = items[0];
        oldCrsInfo.channel   = parseInt(items[1], 8);
        oldCrsInfo.stationId = items[2];
        oldCrsInfo.crayId    = items[3];
      }
    }
  }
  if (typeof customProps["NETWORK"] !== "undefined") {
    for (const prop of customProps["NETWORK"]) {
      let ei = prop.indexOf("=");
      if (ei < 0) {
        throw new Error(`Invalid NETWORK definition: \"${prop}\"`);
      }
      let key   = prop.substring(0, ei).trim().toUpperCase();
      let value = prop.substring(ei + 1).trim();
      if (key === "HOSTID") {
        newHostID = value.toUpperCase();
      }
      else if (key === "CRAYSTATION") {
        //
        //  crayStation=<name>,<lid>,<channelNo>,<addr>[,S<station-id>][,C<cray-id>]
        //
        let items = value.split(",");
        if (items.length >= 4) {
          newCrsInfo.lid       = items[1];
          newCrsInfo.channel   = parseInt(items[2], 8);
          newCrsInfo.stationId = "FE";
          newCrsInfo.crayId    = "C1";
          for (let i = 4; i < items.length; i++) {
            if (items[i].startsWith("C")) {
              newCrsInfo.crayId = items[i].substring(1);
            }
            else if (items[i].startsWith("S")) {
              newCrsInfo.stationId = items[i].substring(1);
            }
          }
        }
      }
    }
  }
  return Promise.resolve();
};

/*
 * replaceFile
 *
 * Replace a file on the running system.
 *
 * Arguments:
 *   filename - file name (e.g., LIDCMXY)
 *   data     - contents of the file
 *   options  - optional object providing job credentials and HTTP hostname
 *
 * Returns:
 *   A promise that is resolved when the file has been replaced.
 */
const replaceFile = (filename, data, options) => {
  const job = [
    `$COPY,INPUT,FILE.`,
    `$REPLACE,FILE=${filename}.`
  ];
  if (typeof options === "undefined") options = {};
  options.jobname = "REPFILE";
  options.data    = data;
  return dtc.createJobWithOutput(12, 4, job, options);
};

/*
 * updateLIDCMxx
 *
 * Create/Update the LIDCMxx file to reflect the machine's new identifier, if any.
 *
 * Returns:
 *  A promise that is resolved when the LIDCMxx file has been updated.
 */
const updateLIDCMxx = () => {
  if (oldMID !== newMID && newMID !== null) {
    return dtc.say(`Create LIDCM${newMID} ...`)
    .then(() => utilities.getFile(dtc, `LIDCM${oldMID}/UN=SYSTEMX`))
    .then(text => {
      text = text.replace(`LIDCM${oldMID}`, `LIDCM${newMID}`);
      regex = new RegExp(`[LP]ID=M${oldMID}[,.]`);
      while (true) {
        let si = text.search(regex);
        if (si < 0) break;
        text = `${text.substring(0, si + 5)}${newMID}${text.substring(si + 7)}`;
      }
      return text;
    })
    .then(text => replaceFile(`LIDCM${newMID}`, text))
    .then(() => utilities.moveFile(dtc, `LIDCM${newMID}`, 1, 377777));
  }
  else {
    return Promise.resolve();
  }
};

/*
 * updateProductRecords
 *
 * Update the PRODUCT file to include any new or modified records that have
 * been defined.
 *
 * Returns:
 *  A promise that is resolved when the PRODUCT file has been updated.
 */
const updateProductRecords = () => {
  if (productRecords.length > 0) {
    const job = [
      "$SETTL,*.",
      "$SETJSL,*.",
      "$SETASL,*.",
      "$ATTACH,PRODUCT/M=W,WB.",
      "$COPY,INPUT,LGO.",
      "$LIBEDIT,P=PRODUCT,B=LGO,I=0,LO=EM,C."
    ];
    const options = {
      jobname: "UPDPROD",
      data:    `${productRecords.join("~eor\n")}`
    };
    return dtc.say("Update PRODUCT ...")
    .then(() => dtc.createJobWithOutput(12, 4, job, options))
    .then(output => {
      for (const line of output.split("\n")) {
        console.log(`${new Date().toLocaleTimeString()}   ${line}`);
      }
      return Promise.resolve();
    });
  }
  else {
    return Promise.resolve();
  }
};

/*
 * updateTcpHosts
 *
 * Update the TCPHOST file to reference the local machine ID and to include any
 * additional hosts defined by the HOSTS property, if any.
 *
 * Returns:
 *  A promise that is resolved when the TCPHOST file has been updated.
 */
const updateTcpHosts = () => {

  if ((oldMID === newMID || newMID === null)
      && (oldHostID === newHostID || newHostID === null)
      && typeof customProps["HOSTS"] === "undefined") {
    return Promise.resolve();
  }
  else {
    return dtc.say("Update TCPHOST ...")
    .then(() => utilities.getFile(dtc, "TCPHOST", {username:"NETADMN",password:"NETADMN"}))
    .then(text => {
      let hosts = {};
      let pid = `M${oldMID.toUpperCase()}`;
      let hid = oldHostID.toUpperCase();
      let lcl = `LOCALHOST_${oldMID.toUpperCase()}`;
      text = dtc.cdcToAscii(text);
      for (const line of text.split("\n")) {
        if (/^[0-9]/.test(line)) {
          const tokens = line.split(/\s+/);
          if (tokens.length < 2) continue;
          for (let i = 1; i < tokens.length; i++) {
            let token = tokens[i].toUpperCase();
            if (token === pid && newMID !== null) {
              tokens[i] = `M${newMID}`;
            }
            else if (token === hid && newHostID !== null) {
              tokens[i] = newHostID;
            }
            else if (token === lcl && newMID !== null) {
              tokens[i] = `LOCALHOST_${newMID}`;
            }
          }
          hosts[tokens[1].toUpperCase()] = tokens.join(" ");
        }
      }
      if (typeof customProps["HOSTS"] !== "undefined") {
        for (const defn of customProps["HOSTS"]) {
          if (/^[0-9]/.test(defn)) {
            const tokens = defn.split(/\s+/);
            if (tokens.length > 1) {
              hosts[tokens[1].toUpperCase()] = tokens.join(" ");
            }
          }
        }
      }
      text = "";
      for (const key of Object.keys(hosts).sort()) {
        text += `${hosts[key]}\n`;
      }
      return text;
    })
    .then(text => {
      const job = [
        "$CHANGE,TCPHOST/CT=PU,M=R,AC=Y."
      ];
      const options = {
        jobname: "MAKEPUB",
        username: "NETADMN",
        password: "NETADMN"
      };
      return dtc.putFile("TCPHOST/IA", text, {username:"NETADMN",password:"NETADMN"})
      .then(() => dtc.createJobWithOutput(12, 4, job, options));
    });
  }
};

/*
 * updateTcpResolver
 *
 * If a RESOLVER property is defined, create/update the TCPRSLV file to reflect the TCP/IP
 * resource resolver defined by it.
 *
 * Returns:
 *  A promise that is resolved when the TCPRSLV file has been updated.
 */
const updateTcpResolver = () => {
  if (typeof customProps["RESOLVER"] !== "undefined") {
    const job = [
      "$CHANGE,TCPRSLV/CT=PU,M=R,AC=Y."
    ];
    const options = {
      jobname: "MAKEPUB",
      username: "NETADMN",
      password: "NETADMN"
    };
    return dtc.say("Create/Update TCPRSLV ...")
    .then(() => dtc.putFile("TCPRSLV/IA", `${customProps["RESOLVER"].join("\n")}\n`, {username:"NETADMN",password:"NETADMN"}))
    .then(() => dtc.createJobWithOutput(12, 4, job, options));
  }
  else {
    return Promise.resolve();
  }
};

dtc.connect()
.then(() => dtc.expect([ {re:/Operator> $/} ]))
.then(() => dtc.attachPrinter("LP5xx_C12_E5"))
.then(() => processCmrdProps())
.then(() => processEqpdProps())
.then(() => processNetworkProps())
.then(() => updateProductRecords())
.then(() => updateLIDCMxx())
.then(() => updateTcpResolver())
.then(() => dtc.disconnect())
.then(() => dtc.exec("node", ["opt/rhp-update-ndl"]))
.then(() => {
  return utilities.isInstalled("cybis") ? dtc.exec("node", ["opt/cybis-update-ndl"]) : Promise.resolve();
})
.then(() => {
  return utilities.isInstalled("njf") ? dtc.exec("node", ["opt/njf-update-ndl"]) : Promise.resolve();
})
.then(() => {
  return utilities.isInstalled("tlf") ? dtc.exec("node", ["opt/tlf-update-ndl"]) : Promise.resolve();
})
.then(() => dtc.exec("node", ["compile-ndl"]))
.then(() => dtc.exec("node", ["rhp-configure", "-ndl"]))
.then(() => {
  return utilities.isInstalled("njf") ? dtc.exec("node", ["njf-configure", "-ndl"]) : Promise.resolve();
})
.then(() => {
  return utilities.isInstalled("tlf") ? dtc.exec("node", ["tlf-configure", "-ndl"]) : Promise.resolve();
})
.then(() => {
  return utilities.isInstalled("mailer") ? dtc.exec("node", ["mailer-configure"]) : Promise.resolve();
})
.then(() => {
  if (utilities.isInstalled("netmail")) {
    return dtc.exec("node", ["netmail-configure"])
    .then(() => {
      return (oldHostID !== newHostID && newHostID !== null)
        ? dtc.connect()
          .then(() => dtc.expect([ {re:/Operator> $/} ]))
          .then(() => dtc.attachPrinter("LP5xx_C12_E5"))
          .then(() => dtc.say("Update e-mail address registrations ..."))
          .then(() => dtc.runJob(12, 4, "opt/netmail-reregister-addresses.job", [oldHostID, newHostID]))
          .then(() => dtc.disconnect())
        : Promise.resolve();
    });
  }
  else {
    return Promise.resolve();
  }
})
.then(() => {
  if (utilities.isInstalled("crs")) {
    if (   oldCrsInfo.lid       !== newCrsInfo.lid
        || oldCrsInfo.stationId !== newCrsInfo.stationId
        || oldCrsInfo.crayId    !== newCrsInfo.crayId) {
      return dtc.say("Rebuild CRS ...")
      .then(() => dtc.exec("node", ["install-product","-f","crs"]));
    }
    else if (oldCrsInfo.channel !== newCrsInfo.channel) {
      return dtc.say("Update CRS ...")
      .then(() => dtc.exec("node", ["opt/crs.post"]));
    }
  }
  return Promise.resolve();
})
.then(() => dtc.connect())
.then(() => dtc.expect([ {re:/Operator> $/} ]))
.then(() => dtc.attachPrinter("LP5xx_C12_E5"))
.then(() => updateTcpHosts())
.then(() => dtc.say("Reconfiguration complete"))
.then(() => {
  console.log("-----------------------------------------------------------------");
  console.log("To activate the updated configuration, make a new deadstart tape,");
  console.log("shutdown the system, rename tapes/newds.tap to tapes/ds.tap, and");
  console.log("then restart DtCyber.");
  console.log("-----------------------------------------------------------------");
  process.exit(0);
})
.catch(err => {
  console.log(err);
  process.exit(1);
});
