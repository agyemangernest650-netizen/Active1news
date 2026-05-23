import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getFirestore, collection, getDocs, getDoc, doc, addDoc, updateDoc, increment,
           query, where, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  // ─── YOUR FIREBASE CONFIG ─────────────────────────────────────────────────
  const firebaseConfig = {
  apiKey: "AIzaSyDApdfrTSUndjEivoUqdLTp9-8MoPjFT7U",
  authDomain: "my-news-database.firebaseapp.com",
  projectId: "my-news-database",
  storageBucket: "my-news-database.firebasestorage.app",
  messagingSenderId: "378489670996",
  appId: "1:378489670996:web:53f29f4d96777b62108cc1"
};
  // ─────────────────────────────────────────────────────────────────────────

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);


  // ── AUTO-DETECT CATEGORY FROM FILENAME ──────────────────────────────────
  const filename = location.pathname.split("/").pop().replace(".html","").toLowerCase();
  const CAT_META = {
    news:          { label:"News",          emoji:"📰", color:"#c8102e" },
    music:         { label:"Music",         emoji:"🎵", color:"#7c3aed" },
    entertainment: { label:"Entertainment", emoji:"🎬", color:"#db2777" },
    sports:        { label:"Sports",        emoji:"⚽", color:"#059669" },
    business:      { label:"Business",      emoji:"💼", color:"#1a3a5c" },
    politics:      { label:"Politics",      emoji:"🏛", color:"#b45309" },
  };
  const CAT = CAT_META[filename] ? filename : "news";
  const META = CAT_META[CAT];

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function timeAgo(sec) {
    if (!sec) return "";
    const d = Math.floor(Date.now()/1000 - sec);
    if (d < 60)    return "Just now";
    if (d < 3600)  return Math.floor(d/60)+"m ago";
    if (d < 86400) return Math.floor(d/3600)+"h ago";
    return Math.floor(d/86400)+"d ago";
  }
  function fmt(n){ return n>=1000?(n/1000).toFixed(1)+"k":(n||0)+""; }

  let ALL_POSTS = [];
  let FILTERED  = [];
  let PAGE       = 0;
  const PER_PAGE = 12;
  let SORT_BY    = "newest";

  // ── FETCH ────────────────────────────────────────────────────────────────
  async function fetchPosts() {
    const snap = await getDocs(collection(db,"posts"));
    ALL_POSTS = [];
    snap.forEach(d => ALL_POSTS.push({id:d.id,...d.data()}));
    ALL_POSTS = ALL_POSTS.filter(p=>p.status==="published" && p.categories?.includes(CAT));
    applySort();
  }

  function applySort() {
    FILTERED = [...ALL_POSTS];
    if (SORT_BY==="newest")  FILTERED.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if (SORT_BY==="popular") FILTERED.sort((a,b)=>(b.views||0)-(a.views||0));
    if (SORT_BY==="discussed") FILTERED.sort((a,b)=>(b.commentCount||0)-(a.commentCount||0));
    PAGE=0;
    renderGrid();
  }

  function card(p) {
    const time=timeAgo(p.createdAt?.seconds), views=fmt(p.views||0), cmts=fmt(p.commentCount||0);
    let mediaEl="";
    if (p.imageURL) mediaEl+=`<div class="card-img-wrap"><img src="${p.imageURL}" alt="${p.title}" loading="lazy"></div>`;
    if (p.videoURL) mediaEl+=`<div class="card-video-wrap"><video src="${p.videoURL}" controls preload="none" playsinline></video></div>`;
    if (p.musicURL) mediaEl+=`<div class="card-audio-wrap"><span class="audio-lbl">🎵 Audio</span><audio src="${p.musicURL}" controls preload="none"></audio></div>`;
    if (!mediaEl)   mediaEl=`<div class="card-no-media"><span>${CAT.toUpperCase()}</span></div>`;
    const excerpt=p.body?.length>140?p.body.slice(0,140)+"…":(p.body||"");
    return `
    <article class="card" onclick="openPost('${p.id}')">
      <div class="card-media">${mediaEl}</div>
      <div class="card-body">
        ${p.tag?`<span class="card-tag">${p.tag}</span>`:""}
        <h3 class="card-title">${p.title}</h3>
        <p class="card-excerpt">${excerpt}</p>
        <div class="card-footer">
          <span class="card-author">${p.author||"Admin"}</span>
          <span class="dot">·</span>
          <span>${time}</span>
          <span class="card-stats">
            <span class="stat">👁 ${views}</span>
            <span class="stat">💬 ${cmts}</span>
          </span>
        </div>
      </div>
    </article>`;
  }

  function renderGrid() {
    const grid=document.getElementById("posts-grid");
    const loadBtn=document.getElementById("load-more");

    const slice=FILTERED.slice(0,(PAGE+1)*PER_PAGE);
    if (PAGE===0) grid.innerHTML="";

    if (!FILTERED.length){
      grid.innerHTML=`<div class="empty-state">No posts in ${META.label} yet.</div>`;
      loadBtn.style.display="none"; return;
    }

    grid.innerHTML=slice.map(p=>card(p)).join("");
    loadBtn.style.display=FILTERED.length>(PAGE+1)*PER_PAGE?"flex":"none";
  }

  window.loadMore=()=>{ PAGE++; renderGrid(); };

  window.changeSort=(val)=>{
    SORT_BY=val;
    document.querySelectorAll(".sort-btn").forEach(b=>b.classList.toggle("active",b.dataset.sort===val));
    applySort();
  };

  // ── SEARCH ──────────────────────────────────────────────────────────────
  window.doSearch=()=>{
    const q=document.getElementById("search-input").value.trim().toLowerCase();
    if (!q){FILTERED=[...ALL_POSTS];applySort();return;}
    FILTERED=ALL_POSTS.filter(p=>
      p.title?.toLowerCase().includes(q)||p.body?.toLowerCase().includes(q)||
      p.author?.toLowerCase().includes(q)||p.tag?.toLowerCase().includes(q)
    );
    PAGE=0; renderGrid();
  };

  // ── POST MODAL ───────────────────────────────────────────────────────────
  window.openPost = async (id) => {
    const modal=document.getElementById("post-modal");
    const mbody=document.getElementById("modal-body");
    mbody.innerHTML=`<div class="modal-loading">Loading post…</div>`;
    modal.style.display="flex";
    document.body.style.overflow="hidden";

    const postRef=doc(db,"posts",id);
    const viewKey = "viewed_"+id;
    if (!localStorage.getItem(viewKey)) {
    await updateDoc(postRef,{views:increment(1)});
    localStorage.setItem(viewKey,"1");
    }
    const snap=await getDoc(postRef);
    if (!snap.exists()){mbody.innerHTML=`<div class="modal-loading">Post not found.</div>`;return;}
    const p={id:snap.id,...snap.data()};

    const cSnap=await getDocs(query(collection(db,"comments"),where("postId","==",id)));
    const comments=[];
    cSnap.forEach(d=>comments.push({id:d.id,...d.data()}));
    comments.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const shareUrl = `${location.origin}${location.pathname}?post=${id}`;

    let mediaHtml="";
    if (p.imageURL) mediaHtml+=`<img class="modal-img" src="${p.imageURL}" alt="${p.title}">`;
    if (p.videoURL) mediaHtml+=`<video class="modal-video" src="${p.videoURL}" controls preload="none"></video>`;
    if (p.musicURL) mediaHtml+=`<div class="modal-audio-wrap"><span class="modal-audio-lbl">🎵 Audio Track</span><audio src="${p.musicURL}" controls></audio></div>`;

    mbody.innerHTML=`
      <div class="modal-pills">
        ${p.tag?`<span class="modal-tag">${p.tag}</span>`:""}
        ${(p.categories||[]).map(c=>`<span class="modal-cat">${c}</span>`).join("")}
      </div>
      <h2 class="modal-title">${p.title}</h2>
      <div class="modal-meta">By <strong>${p.author||"Admin"}</strong> · ${timeAgo(p.createdAt?.seconds)} · 👁 ${fmt((p.views||0)+1)} · 💬 ${fmt(p.commentCount||0)}</div>
      <div class="modal-media">${mediaHtml}</div>
      <div class="modal-text">${(p.body||"").replace(/\n/g,"<br>")}</div>

      <div class="m-share-bar">
          <span class="m-share-label">Share this story:</span>
          <button class="share-btn whatsapp" onclick="sharePost('${id}','${p.title.replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.532 5.862L.054 23.947l6.235-1.635A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.373l-.36-.214-3.7.97.987-3.607-.235-.372A9.818 9.818 0 1112 21.818z"/></svg>
            WhatsApp
          </button>
          <button class="share-btn facebook" onclick="window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent('${shareUrl}'),'_blank')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Facebook
          </button>
          <button class="share-btn twitter" onclick="window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent('${p.title}')+'&url='+encodeURIComponent('${shareUrl}'),'_blank')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            X (Twitter)
          </button>
          <button class="share-btn copy-link" onclick="sharePost('${id}','${p.title.replace(/'/g,"\\'")}')">
            📋 Copy Link
          </button>
        </div>

         ${(p.downloadURL) ? `
        <div class="m-download-bar">
          <button class="dl-main-btn" onclick="handleDownload('${p.downloadURL}','${p.downloadName||p.title}')">
            ⬇ Download
          </button>
          <span class="dl-file-info">${p.downloadName||"Download file"}</span>
        </div>` : ""}

      <div class="comments-section">
        <h3 class="comments-heading">💬 Comments <span class="comments-badge">${comments.length}</span></h3>

        <div class="comment-form-box">
          <div class="comment-form-title">Leave a Comment</div>
          <input class="cmt-inp" id="cmt-name-${id}" type="text" placeholder="Your name (optional)">
          <textarea class="cmt-ta" id="cmt-text-${id}" placeholder="Write your comment here…" rows="4"></textarea>
          <button class="cmt-btn" onclick="submitComment('${id}')">Post Comment →</button>
          <div class="cmt-feedback" id="cmt-feedback-${id}"></div>
        </div>

        <div class="comments-list" id="comments-list-${id}">
          ${comments.length?comments.map(c=>`
            <div class="comment-item">
              <div class="comment-avatar">${(c.name||"?")[0].toUpperCase()}</div>
              <div class="comment-content">
                <div class="comment-name">${c.name||"Anonymous"}<span class="comment-time">${timeAgo(c.createdAt?.seconds)}</span></div>
                <div class="comment-text">${c.text}</div>
              </div>
            </div>`).join(""):`<div class="no-comments">No comments yet. Be the first to comment!</div>`}
        </div>
      </div>`;
  };
  // ── SHARE ─────────────────────────────────────────────────────────────────
  window.sharePost = async (id, title) => {
    const url = `${location.origin}${location.pathname}?post=${id}`;
    const shareData = { title: title, url: url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        showShareToast("Link copied to clipboard!");
      }
    } catch(e) {
      try { await navigator.clipboard.writeText(url); showShareToast("Link copied!"); } catch(e2) {}
    }
  };

  function showShareToast(msg) {
    const t = document.getElementById("share-toast");
    t.textContent = msg; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  }

  window.closeModal=()=>{
    document.getElementById("post-modal").style.display="none";
    document.body.style.overflow="";
  };

  window.submitComment = async (postId) => {
    const nameEl=document.getElementById(`cmt-name-${postId}`);
    const textEl=document.getElementById(`cmt-text-${postId}`);
    const feedback=document.getElementById(`cmt-feedback-${postId}`);
    const btn=document.querySelector(".cmt-btn");
    const text=textEl.value.trim();
    const name=nameEl.value.trim()||"Anonymous";
    if (!text){feedback.textContent="Please write something first.";feedback.style.color="#ff6b6b";return;}
    btn.disabled=true; btn.textContent="Posting…"; feedback.textContent="";
    try {
      await addDoc(collection(db,"comments"),{postId,name,text,createdAt:serverTimestamp()});
      await updateDoc(doc(db,"posts",postId),{commentCount:increment(1)});
      nameEl.value=""; textEl.value="";
      feedback.textContent="✓ Comment posted!"; feedback.style.color="#059669";
      const list=document.getElementById(`comments-list-${postId}`);
      list.querySelector(".no-comments")?.remove();
      const div=document.createElement("div"); div.className="comment-item";
      div.innerHTML=`<div class="comment-avatar">${name[0].toUpperCase()}</div>
        <div class="comment-content">
          <div class="comment-name">${name}<span class="comment-time">Just now</span></div>
          <div class="comment-text">${text}</div>
        </div>`;
      list.prepend(div);
      btn.textContent="Post Comment →"; btn.disabled=false;
      setTimeout(()=>feedback.textContent="",3000);
    } catch(e){feedback.textContent="Error. Try again.";feedback.style.color="#ff6b6b";btn.disabled=false;btn.textContent="Post Comment →";}
  };

  // ── INIT ──────────────────────────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", async ()=>{
    // set page titles and colors
    document.title = META.label+" — Active1 News";
    document.getElementById("cat-title").textContent = META.emoji+" "+META.label;
    document.getElementById("cat-desc").textContent = "The latest "+META.label+" stories, updates and more.";
    document.querySelector(".cat-hero-bar").style.background = META.color;
    document.querySelectorAll(".accent-link").forEach(el=>el.style.color=META.color);

    await fetchPosts();

    document.getElementById("search-input").addEventListener("input",doSearch);
    document.getElementById("nav-toggle").addEventListener("click",()=>document.getElementById("mobile-nav").classList.toggle("open"));
    document.getElementById("post-modal").addEventListener("click",e=>{if(e.target===document.getElementById("post-modal"))closeModal();});
  });

window.handleDownload = async (url, filename) => {
  const btn = document.querySelector('.dl-main-btn');
  const orig = btn.innerHTML;
  btn.classList.add('loading');
  btn.innerHTML = '⏳ Downloading…';
  try {
    const fetchUrl = url.includes('cloudinary.com')
      ? url.replace('/upload/', '/upload/fl_attachment/') : url;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    btn.classList.remove('loading');
    btn.classList.add('done');
    btn.innerHTML = '✓ Downloaded';
    showShareToast('✅ Download started — check your Files app');
    setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = orig; }, 4000);
  } catch {
    btn.classList.remove('loading');
    btn.innerHTML = orig;
    showShareToast('❌ Download failed — check the file URL');
  }
};
