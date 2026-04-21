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
    const count=document.getElementById("post-count");
    const loadBtn=document.getElementById("load-more");
    count.textContent=FILTERED.length+" posts";

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
    await updateDoc(postRef,{views:increment(1)});
    const snap=await getDoc(postRef);
    if (!snap.exists()){mbody.innerHTML=`<div class="modal-loading">Post not found.</div>`;return;}
    const p={id:snap.id,...snap.data()};

    const cSnap=await getDocs(query(collection(db,"comments"),where("postId","==",id)));
    const comments=[];
    cSnap.forEach(d=>comments.push({id:d.id,...d.data()}));
    comments.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

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