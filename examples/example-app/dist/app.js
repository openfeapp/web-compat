async function boot() {
  const request = indexedDB.open('demo', 1);
  if (navigator.share) {
    console.log('share available');
  }
  return request;
}

boot();
