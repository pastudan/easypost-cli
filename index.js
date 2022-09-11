#!/usr/bin/env node

import reader from "readline-sync";
import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs";
import Easypost from "@easypost/api";
import terminalLink from "terminal-link";
import { homedir } from "os";
import { join } from "path";
import mkdirp from "mkdirp";

const easypostDir = join(homedir(), ".easypost-cli");
mkdirp.sync(easypostDir);
const envFileName = "config";
const envFilePath = join(easypostDir, envFileName);

dotenv.config({ path: envFilePath });
let mode;

// define a new console logger
const blankLine = () => console.log("");
const chalkMode = (arg) => chalk[mode === "PROD" ? "red" : "green"](arg);
const line = (title, ...args) => {
  console.log();
  console.log(chalkMode(`[${mode} MODE]`), chalk.bold(title));
  console.log(chalk.bgGreen(...args));
};

import pkg from "./package.json" assert { type: "json" };
console.log(`EasyPost CLI v${pkg.version}`);
const apiKey = init(process.argv[2]);
const api = new Easypost(apiKey);
sections();

export function init(modeInput) {
  modeInput = modeInput?.toUpperCase();
  if (!modeInput) {
    // blankLine();
    console.log("Start EasyPost CLI in Test or Prod mode? [T/p]");
    modeInput = reader.prompt().trim().toUpperCase();
  }
  mode = "TEST";
  if (modeInput === "P" || modeInput === "PROD") {
    mode = "PROD";
  }
  let apiKey = process.env[`EASYPOST_${mode}_API_KEY`];
  if (!apiKey) {
    blankLine();

    console.log(`What is your EasyPost ${chalkMode(mode)} API key?`);
    apiKey = reader.prompt();
    let env = "";
    try {
      env = fs.readFileSync(envFilePath);
    } catch {}
    fs.writeFileSync(envFilePath, env + `EASYPOST_${mode}_API_KEY=${apiKey}\n`);
    console.log(
      `Easypost ${chalkMode(mode)} API Key saved to ${join(
        "~",
        ".easypost-cli",
        envFileName
      )}`
    );
  }
  return apiKey;
}

export async function sections() {
  line(
    "Main Menu",
    chalk.bgGreen(
      "[S] Shipments\t[N] New Shipment\t\t\n[A] Addresses\t[P] Parcels\t[Q] Quit\t"
    )
  );
  const section = reader.prompt().trim().toUpperCase();
  if (section === "S") {
    await listShipments();
  } else if (section === "N") {
    await newShipment();
  } else if (section === "A") {
    await listAddresses();
  } else if (section === "P") {
    line("Parcels are not yet implemented");
  } else if (section === "Q") {
    process.exit(0);
  } else {
    line(chalk.red("Invalid section"));
  }
  sections();
}

const mapShipment = (s) => {
  const ins = s.fees.find((f) => f.type === "InsuranceFee")?.amount;
  return {
    // id: s.id,
    carrier: s?.selected_rate?.carrier || "",
    tracking_code: s.tracking_code || "",
    from: s.from_address.name || s.from_address.company,
    to: s.to_address.name,
    customs: s.customs_info ? "Yes" : "No",
    status: s.status,
    cost: parseFloat(s.fees.find((f) => f.type === "PostageFee")?.amount),
    ins: ins ? parseFloat(ins) : "",
  };
};

const mapAddress = (a) => {
  return {
    name: a.name,
    company: a.company,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
  };
};

const mapParcel = (p) => {
  return {
    length: p.length,
    width: p.width,
    height: p.height,
    weight:
      (p.weight / 16 > 1 && Math.floor(p.weight / 16) + "lbs ") +
      Math.round(p.weight % 16) +
      "oz | " +
      (p.weight / 35.274).toFixed(2) +
      "kg",
  };
};

const sortRates = (a, b) => {
  if (parseFloat(a.rate) < parseFloat(b.rate)) return -1;
  if (parseFloat(a.rate) > parseFloat(b.rate)) return 1;
  return 0;
};

const sortShipments = (a, b) => {
  if (new Date(a.created_at) > new Date(b.created_at)) return -1;
  if (new Date(a.created_at) < new Date(b.created_at)) return 1;
  return 0;
};

const mapRate = (r) => {
  return {
    carrier: r.carrier,
    service: r.service,
    rate: r.rate,
    days: r.delivery_days,
    id: r.id,
  };
};

export async function listShipments() {
  const res = await api.Shipment.all({
    page_size: 10,
    purchased: false,
  });
  if (res.shipments.length === 0) {
    line(chalk.red("No shipments found"));
    return sections();
  }
  const sortedShipments = res.shipments.sort(sortShipments);
  // line(sortedShipments[0]);
  console.table(sortedShipments.map(mapShipment));

  line(
    `Showing first 10 Shipments (from last 30 days)`,
    "[0-9] Details | [Enter] Main Menu"
  );

  let shipment;
  while (!shipment) {
    const shipmentInput = reader.prompt().trim();
    shipment = sortedShipments[parseInt(shipmentInput, 10)];
    if (!shipmentInput) {
      return;
    }
    if (shipment) break;
    line(chalk.red("Invalid selection"));
  }
  console.log(chalk.bold("From / To:"));
  const keys = Object.keys(mapAddress(shipment.from_address));
  const longestKey = keys.reduce((a, b) => (a.length > b.length ? a : b));
  const longestFromKey = Object.values(mapAddress(shipment.from_address))
    .map(toString)
    .reduce((a, b) => (a.length > b.length ? a : b));
  const longestToKey = Object.values(mapAddress(shipment.to_address))
    .map(toString)
    .reduce((a, b) => (a.length > b.length ? a : b));
  console.table(
    keys.map((key) => {
      return {
        field: `${key.toUpperCase()}: `.padStart(longestKey.length + 3),
        From:
          shipment.from_address[key]
            ?.toString()
            .padEnd(longestFromKey.length) || null,
        To:
          shipment.to_address[key]?.toString().padEnd(longestToKey.length) ||
          null,
      };
    })
  );
  // console.table(mapAddress(shipment.from_address));
  // console.log(chalk.bold("To:"));
  // console.table(mapAddress(shipment.to_address));
  console.log(chalk.bold("Parcel:"));
  console.table(mapParcel(shipment.parcel));

  if (shipment.selected_rate) {
    console.log(chalk.bold("Selected Rate:"));
    console.table(mapRate(shipment.selected_rate));
  } else {
    console.log(chalk.bold("Available Rates:"));
    console.table(shipment.rates.sort(sortRates).map(mapRate));
  }

  shipment.selected_rate &&
    console.log(chalk.bold("Carrier:"), shipment.selected_rate.carrier);
  shipment.tracker &&
    console.log(chalk.bold("Tracking:"), shipment.tracker.public_url);
  shipment.postage_label &&
    console.log(chalk.bold("Label URL:"), shipment.postage_label.label_url);

  if (!shipment.selected_rate && shipment.rates.length > 0) {
    line(
      `Shipment has not been purchased. Purchase a rate? [0-9] Purchase rate | [Q] Main Menu`
    );
    const shipmentInput = reader.prompt().trim();
    if (shipmentInput.toUpperCase() === "Q") {
      return sections();
    }
    const rate = shipment.rates.sort(sortRates)[parseInt(shipmentInput, 10)];
    if (!shipmentInput || !rate) {
      line(chalk.red("Invalid selection"));
      return sections();
    }
    await shipment.buy(rate.id);
    line(
      chalk.green(
        `Rate Purchased, $${rate.rate} deducted from EasyPost balance.`
      )
    );
  }
}

export async function newAddress() {
  return await new api.Address({
    name: reader.question("Name: ").trim(),
    company: reader.question("Company (optional): ").trim(),
    street1: reader.question("Street 1: ").trim(),
    street2: reader.question("Street 2: ").trim(),
    city: reader.question("City: ").trim(),
    state: reader.question("State: ").trim(),
    zip: reader.question("Zip: ").trim(),
    country: reader.question("Country [US]: ").trim() || "US",
  }).save();
}

export async function newShipment() {
  blankLine();
  const fromAddresses = await listAddresses();
  line(
    "Select or enter a FROM address",
    "[0-9] Selection | [N] New Address | [Q] Quit to main Menu"
  );
  const fromInput = reader.prompt().trim().toUpperCase();
  if (fromInput === "Q") return;
  const from_address =
    fromAddresses[parseInt(fromInput, 10)] || (await newAddress());

  blankLine();
  const toAddresses = await listAddresses();
  line(
    "Select or enter a TO address",
    "[0-9] Selection | [N] New Address | [Q] Quit to main Menu"
  );
  const toInput = reader.prompt().trim().toUpperCase();
  if (toInput === "Q") return;
  const to_address = toAddresses[parseInt(toInput, 10)] || (await newAddress());

  let customs_info;
  if (from_address.country !== to_address.country) {
    line(
      chalk.red(
        'Customs info required for international shipments. Please enter your "customs_info" ID:'
      )
    );
    customs_info = reader.prompt().trim();
  }

  blankLine();
  line("Package Dimensions");
  const parcel = await new api.Parcel({
    length: parseFloat(reader.question("Length (inch): ")),
    height: parseFloat(reader.question("Height (inch): ")),
    width: parseFloat(reader.question("Width (inch): ")),
    weight: parseFloat(reader.question("Weight (oz): ")),
  }).save();

  const shipment = await new api.Shipment({
    from_address,
    to_address,
    parcel,
    customs_info,
  }).save();

  blankLine();
  line("Select a rate to buy:");
  console.table(shipment.rates.sort(sortRates).map(mapRate));
  line("[0-9] Selection | [Q]uit to main menu");
  let rate;
  while (!rate) {
    const rateInput = reader.prompt().trim();
    if (rateInput.toUpperCase() === "Q") return;
    rate = shipment.rates.sort(sortRates)[parseInt(rateInput, 10)];
    if (rateInput && rate) break;
    line(chalk.red("Invalid selection - postage not purchased"));
  }
  await shipment.buy(rate.id);
  blankLine();
  line(
    chalk.green(`Rate Purchased, $${rate.rate} deducted from EasyPost balance.`)
  );
  line(terminalLink("Label URL", shipment.postage_label.label_url));
}

export async function listAddresses() {
  const res = await api.Address.all({ page_size: 5 });
  if (res.addresses.length === 0) {
    line(chalk.red("No addresses found"));
    return sections();
  }
  console.table(
    res.addresses.map((a) => {
      return {
        name: a.name,
        company: a.company,
        street1: a.street1,
        street2: a.street2,
        city: a.city,
        state: a.state,
        zip: a.zip,
        country: a.country,
        phone: a.phone,
        email: a.email,
      };
    })
  );
  return res.addresses;
}
