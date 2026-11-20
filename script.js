// ===== Langkah 1: ambil elemen dari HTML =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const elSkor = document.getElementById("skor");
const elTertinggi = document.getElementById("tertinggi");
const elPesan = document.getElementById("pesan");
const tombolUlang = document.getElementById("tombol-ulang");

// ===== Langkah 2: pengaturan dan variabel dasar =====
const UKURAN_KOTAK = 20;                          // satu kotak = 20x20 piksel
const JUMLAH_KOTAK = canvas.width / UKURAN_KOTAK; // grid 20x20
const KECEPATAN = 140;                            // milidetik per langkah (makin kecil makin cepat)

// Warna ala slither.io: latar gelap, ular dan orb bercahaya
const WARNA_LATAR = "#14161c";
const KULIT_ULAR = ["#4ef0a0", "#22c07a"];        // warna belang pada badan ular
const WARNA_ORB = ["#ff5f8f", "#ffd34e", "#5fc8ff", "#b57bff", "#ff8a4e", "#7dffb0"];

let ular;             // array posisi tiap segmen, kepala di indeks 0
let ularSebelumnya;   // posisi ular satu langkah sebelumnya (untuk gerak halus)
let arah;             // arah gerak yang sedang dipakai
let arahBerikutnya;   // arah yang diminta pemain untuk langkah berikutnya
let makanan;          // posisi dan warna orb makanan
let skor;
let tertinggi = ambilTertinggi();
let status;           // "siap", "main", atau "selesai"
let timer = null;
let waktuLangkah = 0; // kapan langkah terakhir terjadi

// ===== Skor tertinggi (disimpan di localStorage) =====
function ambilTertinggi() {
  try {
    return Number(localStorage.getItem("snake-tertinggi")) || 0;
  } catch (e) {
    return 0; // localStorage tidak tersedia, abaikan saja
  }
}

function simpanTertinggi() {
  try {
    localStorage.setItem("snake-tertinggi", String(tertinggi));
  } catch (e) {
    // abaikan
  }
}

function tampilkanSkor() {
  elSkor.textContent = skor;
  elTertinggi.textContent = tertinggi;
}

// ===== Langkah 7: membuat makanan di posisi acak =====
function buatMakanan() {
  let posisi;
  do {
    posisi = {
      x: Math.floor(Math.random() * JUMLAH_KOTAK),
      y: Math.floor(Math.random() * JUMLAH_KOTAK),
    };
  } while (ular.some((segmen) => segmen.x === posisi.x && segmen.y === posisi.y));

  posisi.warna = WARNA_ORB[Math.floor(Math.random() * WARNA_ORB.length)];
  return posisi; // dijamin tidak berada di badan ular
}

// ===== Langkah 3: menggambar =====

// Pola segi enam dibuat sekali saja di canvas tersembunyi, lalu ditempel tiap frame
function buatPolaHex() {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const g = c.getContext("2d");

  g.fillStyle = WARNA_LATAR;
  g.fillRect(0, 0, c.width, c.height);

  const r = 22;                    // jari-jari segi enam
  const lebar = Math.sqrt(3) * r;  // jarak antar pusat secara horizontal
  const tinggi = 1.5 * r;          // jarak antar baris
  g.strokeStyle = "rgba(255, 255, 255, 0.07)";
  g.lineWidth = 1.5;

  for (let baris = -1; baris * tinggi < c.height + r; baris++) {
    for (let kolom = -1; kolom * lebar < c.width + lebar; kolom++) {
      const cx = kolom * lebar + (baris % 2 ? lebar / 2 : 0);
      const cy = baris * tinggi;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const sudut = (Math.PI / 180) * (60 * k - 30);
        const px = cx + r * Math.cos(sudut);
        const py = cy + r * Math.sin(sudut);
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  return c;
}

const polaHex = buatPolaHex();

function lerp(a, b, t) {
  return a + (b - a) * t; // titik di antara a dan b; t = 0 di a, t = 1 di b
}

function gambarOrb(sekarang) {
  const px = makanan.x * UKURAN_KOTAK + UKURAN_KOTAK / 2;
  const py = makanan.y * UKURAN_KOTAK + UKURAN_KOTAK / 2;
  const radius = 5.5 + Math.sin(sekarang / 180); // berdenyut pelan

  ctx.shadowColor = makanan.warna;
  ctx.shadowBlur = 18;
  ctx.fillStyle = makanan.warna;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function gambarUlar(t) {
  // hitung posisi tiap segmen di antara posisi lama dan posisi baru
  const titik = ular.map((segmen, i) => {
    const lama = ularSebelumnya[Math.min(i, ularSebelumnya.length - 1)];
    return {
      x: lerp(lama.x, segmen.x, t) * UKURAN_KOTAK + UKURAN_KOTAK / 2,
      y: lerp(lama.y, segmen.y, t) * UKURAN_KOTAK + UKURAN_KOTAK / 2,
    };
  });

  // gambar dari ekor ke kepala supaya kepala berada paling atas
  ctx.shadowColor = KULIT_ULAR[0];
  ctx.shadowBlur = 14;
  for (let i = titik.length - 1; i >= 0; i--) {
    ctx.fillStyle = KULIT_ULAR[Math.floor(i / 2) % 2];
    ctx.beginPath();
    ctx.arc(titik[i].x, titik[i].y, i === 0 ? 10.5 : 9.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // mata: dua lingkaran putih di sisi kiri dan kanan arah hadap
  const kepala = titik[0];
  const sampingX = -arah.y; // arah tegak lurus terhadap arah gerak
  const sampingY = arah.x;
  [-1, 1].forEach((sisi) => {
    const ex = kepala.x + arah.x * 3 + sampingX * 5 * sisi;
    const ey = kepala.y + arah.y * 3 + sampingY * 5 * sisi;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, ey, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101010";
    ctx.beginPath();
    ctx.arc(ex + arah.x * 1.5, ey + arah.y * 1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Dipanggil terus oleh requestAnimationFrame, sekitar 60 kali per detik
function render(sekarang) {
  let t = 1;
  if (status === "main") {
    t = Math.min((sekarang - waktuLangkah) / KECEPATAN, 1);
  }

  ctx.drawImage(polaHex, 0, 0);
  gambarOrb(sekarang);
  gambarUlar(t);

  if (status === "selesai") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)"; // gelapkan layar saat game over
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  requestAnimationFrame(render);
}

// ===== Langkah 8: deteksi tabrakan =====
function menabrak(kepala) {
  const keluarBatas =
    kepala.x < 0 ||
    kepala.y < 0 ||
    kepala.x >= JUMLAH_KOTAK ||
    kepala.y >= JUMLAH_KOTAK;

  const menabrakBadan = ular.some(
    (segmen) => segmen.x === kepala.x && segmen.y === kepala.y
  );

  return keluarBatas || menabrakBadan;
}

// ===== Langkah 5 dan 7: satu langkah permainan =====
function update() {
  arah = arahBerikutnya;

  // hitung posisi kepala yang baru
  const kepala = {
    x: ular[0].x + arah.x,
    y: ular[0].y + arah.y,
  };

  if (menabrak(kepala)) {
    selesai();
    return;
  }

  // simpan posisi lama sebelum ular bergerak (dipakai untuk animasi halus)
  ularSebelumnya = ular.map((segmen) => ({ x: segmen.x, y: segmen.y }));
  waktuLangkah = performance.now();

  ular.unshift(kepala); // tambah kepala baru di depan

  if (kepala.x === makanan.x && kepala.y === makanan.y) {
    // makan: ekor tidak dibuang, jadi ular memanjang
    skor++;
    makanan = buatMakanan();
    if (skor > tertinggi) {
      tertinggi = skor;
      simpanTertinggi();
    }
    tampilkanSkor();
  } else {
    ular.pop(); // tidak makan: buang ekor supaya panjang tetap
  }
}

// ===== Langkah 4: game loop =====
function mulaiLoop() {
  status = "main";
  elPesan.textContent = "";
  waktuLangkah = performance.now();
  timer = setInterval(update, KECEPATAN);
}

function selesai() {
  clearInterval(timer);
  timer = null;
  status = "selesai";
  elPesan.textContent = `Game over! Skor kamu ${skor}.`;
}

// ===== Langkah 9: mulai atau main ulang =====
function reset() {
  clearInterval(timer);
  timer = null;

  ular = [
    { x: 10, y: 10 }, // kepala
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  ularSebelumnya = ular.map((segmen) => ({ x: segmen.x, y: segmen.y }));
  arah = { x: 1, y: 0 }; // bergerak ke kanan
  arahBerikutnya = arah;
  skor = 0;
  makanan = buatMakanan();
  status = "siap";

  elPesan.textContent = "Tekan tombol arah atau geser layar untuk mulai.";
  tampilkanSkor();
}

// ===== Langkah 6: membaca keyboard =====
const ARAH_TOMBOL = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

// Semua sumber input (keyboard, geser, tombol layar) lewat fungsi ini
function ubahArah(arahBaru) {
  if (status === "selesai") return;

  // larang berbalik 180 derajat (misalnya dari kanan langsung ke kiri)
  const berbalik = arahBaru.x === -arah.x && arahBaru.y === -arah.y;
  if (berbalik) return;

  arahBerikutnya = arahBaru;

  if (status === "siap") {
    mulaiLoop();
  }
}

document.addEventListener("keydown", (event) => {
  const arahBaru = ARAH_TOMBOL[event.key] || ARAH_TOMBOL[event.key.toLowerCase()];
  if (!arahBaru) return;

  event.preventDefault(); // cegah halaman ikut ter-scroll
  ubahArah(arahBaru);
});

// ===== Kontrol sentuh: geser jari di layar =====
const JARAK_GESER_MINIMAL = 25; // piksel; lebih pendek dari ini dianggap ketukan biasa
let awalSentuh = null;

document.addEventListener("touchstart", (event) => {
  const sentuhan = event.touches[0];
  awalSentuh = { x: sentuhan.clientX, y: sentuhan.clientY };
});

document.addEventListener("touchend", (event) => {
  if (!awalSentuh) return;

  const sentuhan = event.changedTouches[0];
  const dx = sentuhan.clientX - awalSentuh.x;
  const dy = sentuhan.clientY - awalSentuh.y;
  awalSentuh = null;

  if (Math.abs(dx) < JARAK_GESER_MINIMAL && Math.abs(dy) < JARAK_GESER_MINIMAL) return;

  // arah geser ditentukan oleh sumbu yang lebih jauh digeser
  if (Math.abs(dx) > Math.abs(dy)) {
    ubahArah(dx > 0 ? ARAH_TOMBOL.ArrowRight : ARAH_TOMBOL.ArrowLeft);
  } else {
    ubahArah(dy > 0 ? ARAH_TOMBOL.ArrowDown : ARAH_TOMBOL.ArrowUp);
  }
});

// ===== Kontrol sentuh: tombol arah di layar =====
const ARAH_TOMBOL_LAYAR = {
  atas: ARAH_TOMBOL.ArrowUp,
  bawah: ARAH_TOMBOL.ArrowDown,
  kiri: ARAH_TOMBOL.ArrowLeft,
  kanan: ARAH_TOMBOL.ArrowRight,
};

document.querySelectorAll(".dpad button").forEach((tombol) => {
  // pointerdown lebih responsif daripada click, terutama di layar sentuh
  tombol.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    ubahArah(ARAH_TOMBOL_LAYAR[tombol.dataset.arah]);
  });
});

tombolUlang.addEventListener("click", reset);

// jalankan saat halaman pertama kali dibuka
reset();
requestAnimationFrame(render);