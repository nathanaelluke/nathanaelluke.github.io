document.querySelectorAll('.socials a').forEach(icon => {
  icon.addEventListener('click', e => {
    e.preventDefault();
    icon.style.transition = 'transform 0.2s ease';
    icon.style.transform = 'scale(1.5)';
    setTimeout(() => {
      icon.style.transform = 'scale(1)';
      window.open(icon.href, '_blank');
    }, 300);
  });
});

