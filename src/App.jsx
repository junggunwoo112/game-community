import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const USER_STORAGE_KEY = 'asanmaeng_user_v1'

// 👇 운영자 로그인 정보
const ADMIN_NICKNAME = '게장'
const ADMIN_PASSWORD = '1103'

const categories = [
  '공지사항',
  '문파컨텐츠',
  '공략 및 꿀팁',
  '파티 모집',
  '자유게시판',
  '문의사항',
]

const initialPosts = [
  {
    game: '공지사항',
    title: '아산맹 문파 커뮤니티에 오신 것을 환영합니다!',
    content: '문파 공지사항과 컨텐츠, 공략 및 꿀팁, 파티 모집을 자유롭게 이용해 주세요.',
    author: '게장',
    likes: 15,
    views: 500,
    type: '공지사항',
  },
]

function loadSavedUser() {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (err) {
    console.error('저장된 회원 정보 불러오기 실패:', err)
  }
  return null
}

// 이미지 파일을 용량 줄여서 Base64로 변환하는 도우미
function compressImage(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function App() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(loadSavedUser)
  const [likedPostIds, setLikedPostIds] = useState([])
  const [myPostIds, setMyPostIds] = useState([])
  const [myCommentIds, setMyCommentIds] = useState([])

  const [authModal, setAuthModal] = useState(null)
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')

  const [activeMenu, setActiveMenu] = useState('전체글')
  const [activeCategory, setActiveCategory] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [viewMode, setViewMode] = useState('list')
  const [selectedPostId, setSelectedPostId] = useState(null)

  // 글쓰기 / 글수정 상태
  const [editingPostId, setEditingPostId] = useState(null)
  const [newCategory, setNewCategory] = useState('자유게시판')
  const [newTitle, setNewTitle] = useState('')
  const [commentInput, setCommentInput] = useState('')

  // 서식 편집기 참조
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [pendingEditorHtml, setPendingEditorHtml] = useState('')

  const isAdmin = Boolean(currentUser?.isAdmin)
  const menuItems = ['전체글', '인기글', '최신글', '공지사항']

  const writableCategories = isAdmin
    ? categories
    : categories.filter(cat => cat !== '공지사항')

  const fetchCommunityData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false })

      if (postsError) throw postsError

      if (!postsData || postsData.length === 0) {
        const { data: seeded, error: seedError } = await supabase
          .from('posts')
          .insert(initialPosts)
          .select()

        if (seedError) throw seedError
        setPosts((seeded || []).map(p => ({ ...p, commentList: [] })))
        setLoading(false)
        return
      }

      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .order('id', { ascending: true })

      if (commentsError) throw commentsError

      const commentMap = {}
      for (const c of commentsData || []) {
        if (!commentMap[c.post_id]) commentMap[c.post_id] = []
        commentMap[c.post_id].push(c)
      }

      const merged = postsData.map(p => ({
        ...p,
        commentList: commentMap[p.id] || [],
      }))

      setPosts(merged)
    } catch (err) {
      console.error('Supabase 데이터 불러오기 실패:', err)
      alert('Supabase 연결을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCommunityData()
  }, [fetchCommunityData])

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser))
      } else {
        localStorage.removeItem(USER_STORAGE_KEY)
      }
    } catch (err) {
      console.error('회원 정보 저장 실패:', err)
    }
  }, [currentUser])

  // 글쓰기/수정 화면 진입 시 에디터 초기 내용 세팅
  useEffect(() => {
    if (viewMode === 'write' && editorRef.current) {
      editorRef.current.innerHTML = pendingEditorHtml
    }
  }, [viewMode, pendingEditorHtml])

  const selectedPost = posts.find(p => p.id === selectedPostId) || null

  let visiblePosts = [...posts]

  if (activeCategory) {
    visiblePosts = visiblePosts.filter(post => post.game === activeCategory)
  } else if (activeMenu === '공지사항') {
    visiblePosts = visiblePosts.filter(
      post => post.game === '공지사항' || post.type === '공지사항'
    )
  } else if (activeMenu === '인기글') {
    visiblePosts = visiblePosts.filter(
      post => post.type === '인기글' || (post.likes || 0) >= 5
    )
  } else if (activeMenu === '최신글') {
    visiblePosts = visiblePosts.filter(post => post.game !== '공지사항')
  }

  const trimmedQuery = searchQuery.trim().toLowerCase()
  if (trimmedQuery) {
    visiblePosts = visiblePosts.filter(post =>
      post.title.toLowerCase().includes(trimmedQuery)
    )
  }

  if (!activeCategory && activeMenu === '전체글') {
    visiblePosts.sort((a, b) => {
      const aNotice = a.game === '공지사항' || a.type === '공지사항' ? 1 : 0
      const bNotice = b.game === '공지사항' || b.type === '공지사항' ? 1 : 0
      if (aNotice !== bNotice) return bNotice - aNotice
      return b.id - a.id
    })
  }

  // 에디터 서식 명령 실행
  function applyFormat(command, value = null) {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
  }

  // 이미지 파일 선택 시 에디터 본문에 삽입
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressedDataUrl = await compressImage(file, 800)
      if (editorRef.current) {
        editorRef.current.focus()
        const imgHtml = `<div style="margin: 12px 0;"><img src="${compressedDataUrl}" alt="첨부 이미지" style="max-width: 100%; border-radius: 8px;" /></div><p><br></p>`
        document.execCommand('insertHTML', false, imgHtml)
      }
    } catch (err) {
      alert('이미지 처리 중 오류가 발생했습니다.')
      console.error(err)
    } finally {
      e.target.value = ''
    }
  }

  function openAuthModal(mode) {
    setAuthModal(mode)
    setNicknameInput('')
    setPasswordInput('')
  }

  function handleAuthSubmit(e) {
    e.preventDefault()
    const cleanName = nicknameInput.trim()
    const cleanPw = passwordInput.trim()

    if (!cleanName || !cleanPw) {
      alert('닉네임과 비밀번호를 모두 입력해주세요.')
      return
    }

    if (cleanName === ADMIN_NICKNAME) {
      if (authModal === 'signup') {
        alert('해당 닉네임은 운영자 전용입니다. 로그인을 이용해주세요.')
        return
      }
      if (cleanPw !== ADMIN_PASSWORD) {
        alert('운영자 비밀번호가 일치하지 않습니다.')
        return
      }
      setCurrentUser({ nickname: cleanName, isAdmin: true })
    } else {
      setCurrentUser({ nickname: cleanName, isAdmin: false })
    }

    setAuthModal(null)
    setNicknameInput('')
    setPasswordInput('')
  }

  function handleLogout() {
    setCurrentUser(null)
  }

  function selectMenu(menu) {
    setActiveMenu(menu)
    setActiveCategory(null)
    setEditingPostId(null)
    setViewMode('list')
    setSelectedPostId(null)
  }

  function selectCategory(category) {
    setActiveCategory(category)
    setActiveMenu(category === '공지사항' ? '공지사항' : '전체글')
    setEditingPostId(null)
    setViewMode('list')
    setSelectedPostId(null)
  }

  function openWriteForm() {
    const isNoticeContext = activeMenu === '공지사항' || activeCategory === '공지사항'
    setEditingPostId(null)
    setNewTitle('')
    setPendingEditorHtml('')

    if (isNoticeContext && isAdmin) {
      setNewCategory('공지사항')
    } else if (activeCategory && activeCategory !== '공지사항') {
      setNewCategory(activeCategory)
    } else {
      setNewCategory('자유게시판')
    }
    setViewMode('write')
  }

  function openEditForm(post) {
    setEditingPostId(post.id)
    setNewCategory(post.game || '자유게시판')
    setNewTitle(post.title || '')
    // 기존 일반 텍스트 글도 줄바꿈 유지해서 에디터에 넣기
    const raw = post.content || ''
    const hasHtmlTag = /<[a-z][\s\S]*>/i.test(raw)
    setPendingEditorHtml(hasHtmlTag ? raw : raw.replace(/\n/g, '<br>'))
    setViewMode('write')
  }

  async function handlePostClick(post) {
    const nextViews = (post.views || 0) + 1
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, views: nextViews } : p))
    )
    setSelectedPostId(post.id)
    setEditingPostId(null)
    setCommentInput('')
    setViewMode('detail')

    await supabase
      .from('posts')
      .update({ views: nextViews })
      .eq('id', post.id)
  }

  async function handleCreateOrUpdatePost(e) {
    e.preventDefault()
    const editorHtml = editorRef.current ? editorRef.current.innerHTML.trim() : ''
    const plainText = editorRef.current ? editorRef.current.innerText.trim() : ''
    const hasImage = editorHtml.includes('<img')

    if (!newTitle.trim() || (!plainText && !hasImage)) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    if (newCategory === '공지사항' && !isAdmin) {
      alert('공지사항은 운영자만 작성하거나 수정할 수 있습니다.')
      return
    }

    const postType = newCategory === '공지사항' ? '공지사항' : '최신글'

    if (editingPostId !== null) {
      const { data, error } = await supabase
        .from('posts')
        .update({
          game: newCategory,
          title: newTitle.trim(),
          content: editorHtml,
          type: postType,
        })
        .eq('id', editingPostId)
        .select()
        .single()

      if (error) {
        alert(`게시글 수정 실패: ${error.message}`)
        console.error(error)
        return
      }

      setPosts(prev =>
        prev.map(p =>
          p.id === editingPostId
            ? { ...p, ...data, commentList: p.commentList || [] }
            : p
        )
      )
      setSelectedPostId(editingPostId)
      setEditingPostId(null)
      setNewTitle('')
      setPendingEditorHtml('')
      setViewMode('detail')
      return
    }

    const authorName = currentUser ? currentUser.nickname : '익명 문파원'

    const { data, error } = await supabase
      .from('posts')
      .insert([
        {
          game: newCategory,
          title: newTitle.trim(),
          content: editorHtml,
          author: authorName,
          likes: 0,
          views: 1,
          type: postType,
        },
      ])
      .select()
      .single()

    if (error) {
      alert('게시글 등록 중 오류가 발생했습니다.')
      console.error(error)
      return
    }

    setMyPostIds(prev => [...prev, data.id])
    setPosts(prev => [{ ...data, commentList: [] }, ...prev])
    setNewTitle('')
    setPendingEditorHtml('')
    setSearchQuery('')
    setViewMode('list')

    if (newCategory === '공지사항') {
      setActiveMenu('공지사항')
      setActiveCategory('공지사항')
    } else {
      setActiveMenu('전체글')
      setActiveCategory(null)
    }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('정말 이 게시글을 삭제할까요?')) return

    await supabase.from('comments').delete().eq('post_id', postId)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      alert(`게시글 삭제 실패: ${error.message}`)
      console.error(error)
      return
    }

    setPosts(prev => prev.filter(p => p.id !== postId))
    setSelectedPostId(null)
    setViewMode('list')
  }

  async function handleToggleLike(postId) {
    const target = posts.find(p => p.id === postId)
    if (!target) return

    const alreadyLiked = likedPostIds.includes(postId)
    const nextLikes = alreadyLiked
      ? Math.max(0, (target.likes || 0) - 1)
      : (target.likes || 0) + 1

    setLikedPostIds(prev =>
      alreadyLiked ? prev.filter(id => id !== postId) : [...prev, postId]
    )
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, likes: nextLikes } : p))
    )

    await supabase
      .from('posts')
      .update({ likes: nextLikes })
      .eq('id', postId)
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentInput.trim() || !selectedPost) return

    const authorName = currentUser ? currentUser.nickname : '익명 문파원'

    const { data, error } = await supabase
      .from('comments')
      .insert([
        {
          post_id: selectedPost.id,
          author: authorName,
          text: commentInput.trim(),
        },
      ])
      .select()
      .single()

    if (error) {
      alert('댓글 등록 중 오류가 발생했습니다.')
      console.error(error)
      return
    }

    setMyCommentIds(prev => [...prev, data.id])
    setPosts(prev =>
      prev.map(p =>
        p.id === selectedPost.id
          ? { ...p, commentList: [...p.commentList, data] }
          : p
      )
    )
    setCommentInput('')
  }

  async function handleDeleteComment(commentId) {
    if (!selectedPost) return
    if (!window.confirm('이 댓글을 삭제할까요?')) return

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)

    if (error) {
      alert(`댓글 삭제 실패: ${error.message}`)
      console.error(error)
      return
    }

    setPosts(prev =>
      prev.map(p =>
        p.id === selectedPost.id
          ? {
              ...p,
              commentList: p.commentList.filter(c => c.id !== commentId),
            }
          : p
      )
    )
  }

  const isNoticeBoard = activeMenu === '공지사항' || activeCategory === '공지사항'
  const canWrite = !isNoticeBoard || isAdmin
  const canEditOrDeletePost =
    selectedPost && (isAdmin || myPostIds.includes(selectedPost.id))

  return (
    <div className="app">
      <header className="header">
        <div className="logo" onClick={() => selectMenu('전체글')}>
          GAME<span>COMMUNITY</span>
        </div>

        <nav>
          {menuItems.map(menu => (
            <a
              key={menu}
              className={activeMenu === menu && !activeCategory && viewMode === 'list' ? 'active' : ''}
              onClick={() => selectMenu(menu)}
            >
              {menu}
            </a>
          ))}
        </nav>

        <div className="account">
          {currentUser ? (
            <>
              <span className="user-badge">
                {isAdmin ? `👑 ${currentUser.nickname} (운영자)` : `${currentUser.nickname}님`}
              </span>
              <button className="login" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button className="login" onClick={() => openAuthModal('login')}>
                로그인
              </button>
              <button className="signup" onClick={() => openAuthModal('signup')}>
                회원가입
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="welcome">
          <p>ALL GAMES, ONE COMMUNITY</p>
          <h1>아산맹 문파</h1>
          <span>다양한 게임의 소식과 공략, 이야기를 나눠보세요.</span>
        </section>

        <div className="content">
          <section className="main-content">
            {viewMode === 'write' && (
              <form className="write-form" onSubmit={handleCreateOrUpdatePost}>
                <h2>
                  {editingPostId !== null
                    ? '✏️ 게시글 수정'
                    : newCategory === '공지사항'
                      ? '📢 공지사항 작성'
                      : '✍️ 새 게시글 작성'}
                </h2>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                  {writableCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="제목을 입력하세요"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />

                {/* 서식 툴바 */}
                <div className="editor-toolbar">
                  <button type="button" onClick={() => applyFormat('justifyLeft')} title="왼쪽 정렬">
                    왼쪽 정렬
                  </button>
                  <button type="button" onClick={() => applyFormat('justifyCenter')} title="가운데 정렬">
                    가운데 정렬
                  </button>
                  <button type="button" onClick={() => applyFormat('indent')} title="들여쓰기">
                    들여쓰기 →
                  </button>
                  <button type="button" onClick={() => applyFormat('outdent')} title="내어쓰기">
                    ← 내어쓰기
                  </button>
                  <button type="button" onClick={() => applyFormat('bold')} title="굵게">
                    <b>B</b>
                  </button>
                  <select
                    aria-label="글자 크기"
                    defaultValue="3"
                    onChange={e => applyFormat('fontSize', e.target.value)}
                  >
                    <option value="2">작은 글씨</option>
                    <option value="3">보통 글씨</option>
                    <option value="4">조금 크게</option>
                    <option value="5">큰 글씨</option>
                    <option value="6">아주 크게</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="이미지 넣기"
                  >
                    🖼️ 이미지 넣기
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                </div>

                {/* 서식 편집 본문 */}
                <div
                  ref={editorRef}
                  className="rich-editor"
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="내용을 입력하세요..."
                />

                <div className="form-actions">
                  <button
                    type="button"
                    className="login"
                    onClick={() => {
                      const prevId = editingPostId
                      setEditingPostId(null)
                      setViewMode(prevId !== null ? 'detail' : 'list')
                    }}
                  >
                    취소
                  </button>
                  <button type="submit" className="signup">
                    {editingPostId !== null
                      ? '수정 완료'
                      : newCategory === '공지사항'
                        ? '공지 등록하기'
                        : '등록하기'}
                  </button>
                </div>
              </form>
            )}

            {viewMode === 'detail' && selectedPost && (
              <div className="post-detail">
                <div className="detail-top">
                  <span className="badge">
                    {selectedPost.game === '공지사항' ? '📢 공지사항' : selectedPost.game}
                  </span>
                  {canEditOrDeletePost && (
                    <div className="detail-actions">
                      <button
                        type="button"
                        className="login"
                        onClick={() => openEditForm(selectedPost)}
                      >
                        수정하기
                      </button>
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => handleDeletePost(selectedPost.id)}
                      >
                        {isAdmin && !myPostIds.includes(selectedPost.id)
                          ? '운영자 권한 삭제'
                          : '삭제하기'}
                      </button>
                    </div>
                  )}
                </div>
                <h2>{selectedPost.title}</h2>
                <small>
                  작성자 {selectedPost.author || '익명 문파원'} · 조회{' '}
                  {(selectedPost.views || 0).toLocaleString()} · 추천 {selectedPost.likes || 0} · 댓글{' '}
                  {selectedPost.commentList.length}
                </small>
                <hr />
                <div
                  className="post-body"
                  dangerouslySetInnerHTML={{
                    __html: /<[a-z][\s\S]*>/i.test(selectedPost.content || '')
                      ? selectedPost.content
                      : (selectedPost.content || '').replace(/\n/g, '<br>'),
                  }}
                />

                <div className="like-area">
                  <button
                    type="button"
                    className={`like-btn ${likedPostIds.includes(selectedPost.id) ? 'liked' : ''}`}
                    onClick={() => handleToggleLike(selectedPost.id)}
                  >
                    👍 추천 {selectedPost.likes || 0}
                  </button>
                </div>

                <hr />

                <h3>💬 댓글 ({selectedPost.commentList.length})</h3>
                <form className="write-form" onSubmit={handleAddComment}>
                  <input
                    type="text"
                    placeholder="댓글을 입력하세요"
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                  />
                  <div className="form-actions">
                    <button type="submit" className="signup">
                      댓글 등록
                    </button>
                  </div>
                </form>

                {selectedPost.commentList.length > 0 ? (
                  selectedPost.commentList.map(comment => (
                    <div className="post" key={comment.id}>
                      <div className="comment-header">
                        <strong>{comment.author || '익명 문파원'}</strong>
                        {(isAdmin || myCommentIds.includes(comment.id)) && (
                          <button
                            type="button"
                            className="comment-delete-btn"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <span>{comment.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="post">첫 번째 댓글을 남겨보세요!</p>
                )}

                <button className="more" onClick={() => setViewMode('list')}>
                  목록으로 돌아가기
                </button>
              </div>
            )}

            {viewMode === 'list' && (
              <>
                <div className="board-header">
                  <h2>
                    {activeCategory === '공지사항' || activeMenu === '공지사항'
                      ? '📢 공지사항'
                      : activeCategory
                        ? `📌 ${activeCategory}`
                        : activeMenu === '인기글'
                          ? '🔥 인기 게시글'
                          : activeMenu === '최신글'
                            ? '📝 최신 게시글'
                            : '📋 전체 게시글'}
                  </h2>
                  {canWrite && (
                    <button className="signup" onClick={openWriteForm}>
                      {isNoticeBoard && isAdmin ? '공지사항 쓰기' : '글쓰기'}
                    </button>
                  )}
                </div>

                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="🔍 게시글 제목 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="login"
                      onClick={() => setSearchQuery('')}
                    >
                      초기화
                    </button>
                  )}
                </div>

                {loading ? (
                  <p>게시글을 불러오는 중...</p>
                ) : visiblePosts.length > 0 ? (
                  visiblePosts.map(post => {
                    const isNotice = post.game === '공지사항' || post.type === '공지사항'
                    return (
                      <div
                        className="post clickable"
                        key={post.id}
                        onClick={() => handlePostClick(post)}
                      >
                        <span>
                          {isNotice ? '📢 [공지] ' : `${post.game} · `}
                          {post.author || '익명 문파원'}
                          {myPostIds.includes(post.id) ? ' (내 글)' : ''}
                        </span>
                        <strong>{post.title}</strong>
                        <small>
                          추천 {post.likes || 0} · 댓글 {post.commentList.length} · 조회{' '}
                          {(post.views || 0).toLocaleString()}
                        </small>
                      </div>
                    )
                  })
                ) : (
                  <p>
                    {trimmedQuery
                      ? `'${searchQuery}'에 해당하는 게시글이 없습니다.`
                      : '아직 등록된 게시글이 없습니다.'}
                  </p>
                )}
              </>
            )}
          </section>

          <aside>
            <h2>📌 게시판 메뉴</h2>

            {categories.map(category => (
              <div
                className={`game ${activeCategory === category ? 'selected' : ''}`}
                key={category}
                onClick={() => selectCategory(category)}
              >
                {category === '공지사항' ? `📢 ${category}` : category} <b>›</b>
              </div>
            ))}

            <button className="more" onClick={() => selectMenu('전체글')}>
              전체 게시글 보기
            </button>
          </aside>
        </div>
      </main>

      {authModal && (
        <div className="modal-backdrop" onClick={() => setAuthModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>{authModal === 'login' ? '🔐 로그인' : '✨ 회원가입'}</h2>
            <form className="write-form" onSubmit={handleAuthSubmit}>
              <input
                type="text"
                placeholder="문파 닉네임을 입력하세요"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
              />
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="login"
                  onClick={() => setAuthModal(null)}
                >
                  닫기
                </button>
                <button type="submit" className="signup">
                  {authModal === 'login' ? '로그인하기' : '가입하고 시작'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App