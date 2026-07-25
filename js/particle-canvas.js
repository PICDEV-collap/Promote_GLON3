/* ==========================================================================
   GLO N3 - Interactive Particle Canvas Background
   Dynamic Cyber-Astro Floating Stars & Lottery Digit Particles
   ========================================================================== */

(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;

  const particles = [];
  const digitParticles = [];
  const particleCount = 70;
  const digitCount = 20;

  const colors = ['#ffd700', '#10b981', '#06b6d4', '#8b5cf6', '#ffffff'];

  let mouse = { x: null, y: null, radius: 150 };

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  resize();

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 2.5 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = (Math.random() - 0.5) * 0.6;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.alpha = Math.random() * 0.7 + 0.3;
      this.pulseSpeed = Math.random() * 0.02 + 0.005;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;

      // Mouse repulsion/glow
      if (mouse.x !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const angle = Math.atan2(dy, dx);
          const force = (mouse.radius - dist) / mouse.radius;
          this.x -= Math.cos(angle) * force * 2;
          this.y -= Math.sin(angle) * force * 2;
        }
      }

      this.alpha += Math.sin(Date.now() * this.pulseSpeed) * 0.01;
      if (this.alpha < 0.2) this.alpha = 0.2;
      if (this.alpha > 0.9) this.alpha = 0.9;
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class DigitParticle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.digit = Math.floor(Math.random() * 10).toString();
      this.fontSize = Math.floor(Math.random() * 12) + 14;
      this.vy = - (Math.random() * 0.4 + 0.2); // Slow upward float
      this.alpha = Math.random() * 0.25 + 0.05;
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
      this.y += this.vy;
      if (this.y < -20) {
        this.y = height + 20;
        this.x = Math.random() * width;
      }
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.font = `700 ${this.fontSize}px 'Prompt', sans-serif`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fillText(this.digit, this.x, this.y);
      ctx.restore();
    }
  }

  // Initialize
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  for (let i = 0; i < digitCount; i++) {
    digitParticles.push(new DigitParticle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw background subtle gradient nebula
    const grad = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, Math.max(width, height));
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.03)');
    grad.addColorStop(0.5, 'rgba(255, 215, 0, 0.02)');
    grad.addColorStop(1, 'rgba(7, 10, 18, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Update & draw particles
    digitParticles.forEach((dp) => {
      dp.update();
      dp.draw();
    });

    particles.forEach((p) => {
      p.update();
      p.draw();
    });

    // Draw light connecting lines between close particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 110) {
          ctx.save();
          ctx.globalAlpha = (1 - dist / 110) * 0.15;
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
})();
