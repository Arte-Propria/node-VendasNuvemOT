import axios from "axios"
import dotenv from "dotenv"

dotenv.config()

// Your deployed Google Apps Script Web App URL
const WEBHOOK_URL =  process.env.WEBHOOK_TESTE_URL;

// The payload structure expected by your doPost(e) function
const testPayload = {
  "retorno": {
    "pedido": {
      "id": "904466014", // The ID to find in your spreadsheet's 'id' column
      "situacao": "Não entregue",
      "codigo_rastreamento": "TESTE123456BR",
      "url_rastreamento": "https://exemplo.com/rastreio/TESTE123456BR"
    }
  }
};

export async function testWebhook() {
  console.log(`🚀 Sending test request to: ${WEBHOOK_URL}`);
  console.log(`📦 Payload:`, JSON.stringify(testPayload, null, 2));

  try {
    const response = await axios.post(WEBHOOK_URL, testPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log('✅ Success! Server responded:');
    console.log('   Status:', response.status);
    console.log('   Response Body:', response.data);
  } catch (error) {
    console.error('❌ Request failed:');
    if (error.response) {
      // Server responded with an error status
      console.log('   Status:', error.response.status);
      console.log('   Error Data:', error.response.data);
    } else {
      // Network or other errors
      console.log('   Error:', error.message);
    }
  }
}