// Init global variables
const db_name = "yt-player-local-media:113797921251474314533||110311526107361831671"
const request = window.indexedDB.open(db_name, 5);
const video_metainfo = []; // all stuff for video decryption stored here
let db;

request.addEventListener('success', () => {
  console.log('yt-player-local-media opened succesfully');
  db = request.result;
  parseIndexTable();
});

// Stage I. Exctract info from IndexedDB url
function parseIndexTable(){
  const transaction = db.transaction("index", "readonly");
  const objectStore = transaction.objectStore("index");
  objectStore.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      let urlParams = new URLSearchParams(cursor.value.format.url);
      video_meta = {
        format: cursor.value.format.mimeType.split(';')[0].replace('/', '.'),
        aes_key: toBytesArray(urlParams.get("ck")),
        aes_iv: toBytesArray(urlParams.get("civ")),
        video_id: urlParams.get("docid"),
        last_modified: cursor.value.format.lastModified,
        blob_enc: new ArrayBuffer()
      };
      video_metainfo.push(video_meta);
      cursor.continue();
    }
  };
  transaction.oncomplete = parseMediaTable;  
}


// Stage II. Populate encrypted video blobs from table `media`
function parseMediaTable(){
  const transaction = db.transaction("media", "readonly");
  const objectStore = transaction.objectStore("media");
  objectStore.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      for (meta of video_metainfo){
        if (cursor.key.includes(meta.last_modified) && cursor.key.includes(meta.video_id)){
          let new_blob = _appendBuffer(meta.blob_enc, cursor.value);
          meta.blob_enc = new_blob;
          //debugger;
        }
      }
      cursor.continue();
    }
    transaction.oncomplete = decryptVideo;
  };
}

// Stage III. Decrypt these blobs
async function decryptVideo(){
  console.log(`Decrypt ${video_metainfo.length} media files`);
  for (meta of video_metainfo){
    const key = await window.crypto.subtle.importKey(
      "raw",
      meta.aes_key,
      {
        name: "AES-CTR"
      },
      false,
      ["decrypt"]
    );

    const blob_dec = await window.crypto.subtle.decrypt(
      {
        name: "AES-CTR",
        counter: meta.aes_iv,
        length: 128
      },
      key,
      meta.blob_enc
    ) 
    askForDownload(blob_dec, `${meta.video_id}-${meta.format}`);
  }
}

// Stage IV. Save video locally
function askForDownload(blob, name){
  let a = window.document.createElement('a');
  a.href = window.URL.createObjectURL(new Blob([blob], { type: "image/png" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// Helpers
var _appendBuffer = function(buffer1, buffer2) {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};

function toBytesArray(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}