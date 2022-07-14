import reader from "readline-sync";
import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs";
import Easypost from "@easypost/api";
import terminalLink from "terminal-link";

// import { init, sections } from "./utils.js";

dotenv.config();
console.log("EasyPost CLI v0.0.1");
const apiKey = init(false);
const api = new Easypost(apiKey);
sections();
// listShipments();

export function init(defaultToProd) {
  let modeInput;
  if (defaultToProd) {
    modeInput = "P";
  } else {
    console.log("\nAPI Mode: (T)est / (p)rod?");
    modeInput = reader.prompt().trim().toUpperCase();
  }
  let mode = "TEST";
  if (modeInput === "P") {
    mode = "PROD";
    console.log(chalk.red("Starting in PROD mode"));
  } else {
    console.log(chalk.green("Starting in TEST mode"));
  }
  let apiKey = process.env[`EASYPOST_${mode}_API_KEY`];
  if (!apiKey) {
    console.log(
      `What is your ${mode} API key? (NOTE: This will be saved to .env)`
    );
    apiKey = reader.prompt();
    let env = "";
    try {
      env = fs.readFileSync(".env");
    } catch {}
    fs.writeFileSync(".env", env + `EASYPOST_${mode}_API_KEY=${apiKey}\n`);
  }
  return apiKey;
}

export async function sections() {
  console.log(
    "\n[S]hipments | [N]ew Shipment | [A]ddresses | [P]arcels | [Q]uit"
  );
  const section = reader.prompt().trim().toUpperCase();
  if (section === "S") {
    await listShipments();
  } else if (section === "N") {
    await newShipment();
  } else if (section === "A") {
    await listAddresses();
  } else if (section === "P") {
    await listParcels();
  } else if (section === "Q") {
    process.exit(0);
  } else {
    console.log(chalk.red("Invalid section"));
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
  };
};

export async function listShipments() {
  const res = await api.Shipment.all({
    page_size: 10,
    purchased: false,
  });
  if (res.shipments.length === 0) {
    console.log(chalk.red("No shipments found"));
    return sections();
  }
  const sortedShipments = res.shipments.sort(sortShipments);
  // console.log(sortedShipments[0]);
  console.table(sortedShipments.map(mapShipment));

  console.log("\n[#] Details | [Enter] Main Menu");

  let shipment;
  while (!shipment) {
    const shipmentInput = reader.prompt().trim();
    shipment = sortedShipments[parseInt(shipmentInput, 10)];
    if (!shipmentInput) {
      return;
    }
    if (shipment) break;
    console.log(chalk.red("Invalid selection"));
  }
  console.log("FROM");
  console.table(mapAddress(shipment.from_address));
  console.log("TO");
  console.table(mapAddress(shipment.to_address));
  console.log("PARCEL");
  console.table(mapParcel(shipment.parcel));

  if (shipment.selected_rate) {
    console.log("RATE (showing selected rate only)");
    console.table(mapRate(shipment.selected_rate));
  } else {
    console.log("RATES");
    console.table(shipment.rates.sort(sortRates).map(mapRate));
  }

  shipment.selected_rate &&
    console.log("Carrier:", shipment.selected_rate.carrier);
  shipment.tracker &&
    console.log(terminalLink("Track", shipment.tracker.public_url));
  shipment.postage_label &&
    console.log(terminalLink("Label URL", shipment.postage_label.label_url));
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
  console.log("\nSelect or enter a FROM address:");
  const fromAddresses = await listAddresses();
  console.log("[#] Selection | [N]ew Address | [Q]uit to main Menu");
  const fromInput = reader.prompt().trim().toUpperCase();
  if (fromInput === "Q") return;
  const from_address =
    fromAddresses[parseInt(fromInput, 10)] || (await newAddress());

  console.log("\nSelect or enter a TO address:");
  const toAddresses = await listAddresses();
  console.log("[#] Selection | [N]ew Address | [Q]uit to main Menu");
  const toInput = reader.prompt().trim().toUpperCase();
  if (toInput === "Q") return;
  const to_address = toAddresses[parseInt(toInput, 10)] || (await newAddress());

  console.log("\nPackage Dimensions");
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
  }).save();

  console.log("\nSelect a rate to buy:");
  console.table(shipment.rates.sort(sortRates).map(mapRate));
  console.log("[#] Selection | [Q]uit to main menu");
  let rate;
  while (!rate) {
    const rateInput = reader.prompt().trim();
    if (rateInput.toUpperCase() === "Q") return;
    rate = shipment.rates.sort(sortRates)[parseInt(rateInput, 10)];
    if (rateInput && rate) break;
    console.log(chalk.red("Invalid selection - postage not purchased"));
  }
  await shipment.buy(rate.id);
  console.log(
    chalk.green(
      `\nRate Purchased, $${rate.rate} deducted from EasyPost balance.`
    )
  );
  console.log(terminalLink("Label URL", shipment.postage_label.label_url));

  // console.log({ from_address, to_address, parcel });
}

export async function listAddresses() {
  const res = await api.Address.all({ page_size: 5 });
  // console.log(res.addresses[0]);
  if (res.addresses.length === 0) {
    console.log(chalk.red("No addresses found"));
    return sections();
  }
  console.table(
    res.addresses.map((a) => {
      return {
        // id: a.id,
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
