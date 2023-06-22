const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const http = require("http");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function checkEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: 5,
  });
  //return mesage and threa Id
  const emails = res.data.messages;

  if (emails) {
    console.log("Emails:");
    emails.forEach((message) => {
      //processsing emails by looping through messageiD
      processEmail(gmail, message.id);
    });
  } else {
    console.log("No Email found.");
    return;
  }
}

async function processEmail(gmail, messageId) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
  });
  const email = res.data;
  const threadId = email.threadId;
  //check if the email label is already sent
  //if yes then log sent already
  //else call send mail
  if (!email.labelIds.includes("SENT")) {
    const reply = "Thank you for your email!I will get back soon.";
    sendEmail(gmail, email, reply);
  } else {
    console.log("Email already replied:", email.id);
  }
  addLabel(gmail, threadId);
}

async function sendEmail(gmail, email, reply) {
  //this email variable contain email message having
  //header contining to, from, subject
  const headers = email.payload.headers;
  const toHeader = headers.find((header) => header.name === "To");
  const fromHeader = headers.find((header) => header.name === "From");
  const subjectHeader = headers.find((header) => header.name === "Subject");

  const replyMessage = [
    `To: ${fromHeader.value}`,
    `Subject: Re: ${subjectHeader.value}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    reply,
  ].join("\r\n");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: Buffer.from(replyMessage).toString("base64"),
    },
  });

  // if (res) {
  //   console.log("Reply sent:", res.data.id);
  // }
}

function addLabel(gmail, threadId) {
  gmail.users.threads.modify(
    {
      userId: "me",
      id: threadId,
      requestBody: { addLabelIds: ["UNREAD", "SPAM"] },
    },
    (err, res) => {
      if (err) return console.error("Error adding label:", err);
      console.log("Label added:", res.data.id);
    }
  );
}

const server = http.createServer((req, res) => {
  console.log("server running at port 3000");
});
server.listen(3000);

// setInterv

setInterval(() => {
  authorize().then(checkEmails).catch(console.error);
}, Math.floor(Math.random() * (20000 - 5000)) + 5000);
