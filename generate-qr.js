const QRCode = require('qrcode');
const key = 'clawmegle_bf9992e0fb9a4501846296f3e2035a5f';

QRCode.toFile('demo-qr-apple.png', key, {
  width: 400,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#ffffff'
  }
}, function(err) {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  console.log('QR code generated: demo-qr-apple.png');
});
