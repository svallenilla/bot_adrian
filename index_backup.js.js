require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const twilio = require('twilio');
const bodyParser = require('body-parser'); // ✅ SOLO AQUÍ

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Conexión a WhatsApp
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Modelo de usuario (opcional)
const UserSchema = new mongoose.Schema({
  phone: String,
  membership: {
    type: String,
    level: Number,
    endDate: Date
  }
});
const User = mongoose.model('User', UserSchema);

// Ruta principal (cuando alguien escribe al bot)
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.Body?.toLowerCase();
    const from = req.body.From.replace('whatsapp:', '');

    let user = await User.findOne({ phone: from });
    if (!user) user = new User({ phone: from });

    if (/menu|hola|inicio/i.test(message)) {
      await sendMenu(from);
    } else if (/1|membres[ií]as?/i.test(message)) {
      await sendMemberships(from);
    } else if (/2|cl[ií]nicas?/i.test(message)) {
      await sendClinics(from);
    } else if (/3|ayuda|soporte/i.test(message)) {
      await sendHelp(from);
    } else if (/4|estado|mi membres[ií]a/i.test(message)) {
      await sendStatus(from, user);
    } else {
      await sendMessage(from, "Lo siento, no entendí. Escribe 'menu' para comenzar 🧠");
    }

    await user.save();
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('ERROR');
  }
});

// Funciones simpáticas del bot
async function sendMenu(phone) {
  const text = `👋 ¡Hola! Soy VEiDT 🤖\n\nElige una opción:\n1️⃣ Ver membresías\n2️⃣ Clínicas afiliadas\n3️⃣ Ayuda y contacto\n4️⃣ Mi estado`;
  await sendMessage(phone, text);
}

async function sendMemberships(phone) {
  const text = `💡 Membresías:\n\n1. ESENCIAL - $2/mes\n2. PROTECCIÓN - $4/mes\n3. BIENESTAR TOTAL - $6/mes\n\nTodas incluyen descuentos especiales 🏥`;
  await sendMessage(phone, text);
}

async function sendClinics(phone) {
  const text = `🏥 Clínicas afiliadas:\n- Clínica Salud Total\n- Centro Médico Familiar\n- Clínica Dental Sonrisa\n\nEscribe 'menu' para volver.`;
  await sendMessage(phone, text);
}

async function sendHelp(phone) {
  const text = `📞 Soporte VEiDT:\nWhatsApp: 0414-3902085\nCorreo: soporte@veidthealth.com\nHorario: Lun a Vie, 8:00 a 6:00`;
  await sendMessage(phone, text);
}

async function sendStatus(phone, user) {
  const text = `🧾 Tu estado:\nTeléfono: ${user.phone}\nMembresía: ${user.membership?.type || 'No asignada'}\n¡Gracias por usar VEiDT!`;
  await sendMessage(phone, text);
}

async function sendMessage(phone, text) {
  try {
    await client.messages.create({
      body: text,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phone}`
    });
  } catch (err) {
    console.error('Error enviando mensaje:', err);
  }
}

// Arrancar el servidor
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Conectado a MongoDB');
  app.listen(process.env.PORT || 5000, () => {
    console.log(`🚀 Bot VEiDT corriendo en puerto ${process.env.PORT || 5000}`);
  });
}).catch(err => console.error('❌ Error MongoDB:', err));
