import webpush from "web-push";
import crypto from "crypto";

function getVapidKeys() {
  const privateKey = (process.env.PUSH_PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "");
  const configuredPublic = (process.env.NEXT_PUBLIC_VAPID || process.env.VAPID_PUBLIC_KEY || "").trim().replace(/^["']|["']$/g, "");
  const defaultPublic = "BBtch_VrbD3lBahKFtM68sPvbjbGwysDiLrgls0F6IbeoxWAjYL9dhonyYo1Ib49M-yVVxm1F5Qoz40FIePpD70";

  if (!privateKey) {
    return { privateKey: "", publicKey: configuredPublic || defaultPublic };
  }

  try {
    const ecdh = crypto.createECDH("prime256v1");
    const privBuffer = Buffer.from(privateKey, "base64url");
    ecdh.setPrivateKey(privBuffer);
    const derivedPublicKey = ecdh.getPublicKey("base64url");
    return { privateKey, publicKey: derivedPublicKey };
  } catch (e) {
    console.error("[send-push] Failed to derive public key from private key:", e);
    return { privateKey, publicKey: configuredPublic || defaultPublic };
  }
}

export async function handler(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { subscription, subscriptions, title, body, url } = JSON.parse(event.body || "{}");

    const subsList = subscriptions || (subscription ? [subscription] : []);

    if (subsList.length === 0 || !title) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields: subscription(s) and title are required." }),
      };
    }

    const vapid = getVapidKeys();
    if (!vapid.privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "PUSH_PRIVATE_KEY environment variable is missing on Netlify." }),
      };
    }

    const subject = process.env.VAPID_SUBJECT || "mailto:12labofficial@gmail.com";
    webpush.setVapidDetails(subject, vapid.publicKey, vapid.privateKey);

    const payload = JSON.stringify({
      title: title || "12Labs AI Studio",
      body: body || "",
      url: url || null,
      id: Date.now(),
    });

    const results = await Promise.all(
      subsList.map(async (sub) => {
        try {
          const res = await webpush.sendNotification(sub, payload);
          return { success: true, statusCode: res.statusCode };
        } catch (err) {
          console.error("[send-push] Failed to send notification:", err.statusCode, err.body || err.message);
          return {
            success: false,
            statusCode: err.statusCode,
            error: err.body || err.message,
          };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: successCount > 0,
        sentCount: successCount,
        total: subsList.length,
        results,
      }),
    };
  } catch (error) {
    console.error("[send-push] Handler failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
