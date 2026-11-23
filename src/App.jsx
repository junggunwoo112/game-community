import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const USER_STORAGE_KEY = 'asanmaeng_user_v1'

const initialPosts = [
  {
    game: '도깨비의세계',
    title: '요즘 사냥터 어디가 가장 효율적인가요?',
    content: '레벨 50 달성했는데 다음 사냥터 추천 부탁드립니다.',
    author: '문파장',
    likes: 12,
    views: 1203,
    type: '인기글',
  },
  {
    game: '도깨비의세계',
    title: '초보자 육성 팁 공유합니다.',
    content: '초반에는 메인 퀘스트 위주로 미는 게 가장 빠릅니다.',
    author: '육성왕',
    likes: 4,
    views: 320,
    type: '최신글',
  },
  {
    game: '도깨비의세계',
    title: '이번 업데이트 밸런스 어떻게 생각하시나요?',
    content: '원거리 직업군이 조금 상향된 것 같네요.',
    author: '밸런스분석가',
    likes: 9,
    views: 856,
    type: '인기글',
  },
  {
    game: '리그 오브 레전드',
    title: '이번 시즌 정글 티어 정리',
    content: '현재 1티어 챔피언 위주로 정리해 봤습니다.',
    author: '정글러',
    likes: 21,
    views: 2100,
    type: '인기글',
  },
  {
    game: '메이플스토리',
    title: '신규 업데이트 정보 공유',
    content: '이벤트 코인샵 목록 정리입니다.',
    author: '메린이',
    likes: 3,
    views: 642,
    type: '최신글',
  },
  {
    game: '로스트아크',
    title: '뉴비가 알아야 할 기본 공략',
    content: '내실과 레이드 순서 가이드입니다.',
    author: '모코코',
    likes: 2,
    views: 450,
    type: '최신글',
  },
]

const games = ['도깨비의세계', '리그 오브 레전드', '메이플스토리', '로스트아크']

function loadSavedUser() {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (err) {
    console.error('저장된 회원 정보 불러오기 실패:', err)
  }
  return null
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
  const [activeGame, setActiveGame] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [viewMode, setViewMode] = useState('list')
  const [selectedPostId, setSelectedPostId] = useState(null)

  const [newGame, setNewGame] = useState(games[0])
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [commentInput, setCommentInput] = useState('')

  const menuItems = ['전체글', '인기글', '최신글', '공지사항']

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
      alert('Supabase 연결을 확인해주세요. (.env 키 값이나 테이블 이름을 확인해 보세요.)')
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

  const selectedPost = posts.find(p => p.id === selectedPostId) || null

  let visiblePosts = posts
  if (activeGame) {
    visiblePosts = visiblePosts.filter(post => post.game === activeGame)
  }
  if (activeMenu === '인기글') {
    visiblePosts = visiblePosts.filter(post => post.type === '인기글' || (post.likes || 0) >= 5)
  }
  if (activeMenu === '최신글') {
    visiblePosts = visiblePosts.filter(post => post.type === '최신글')
  }
  if (activeMenu === '공지사항') {
    visiblePosts = []
  }

  const trimmedQuery = searchQuery.trim().toLowerCase()
  if (trimmedQuery && activeMenu !== '공지사항') {
    visiblePosts = visiblePosts.filter(post =>
      post.title.toLowerCase().includes(trimmedQuery)
    )
  }

  function openAuthModal(mode) {
    setAuthModal(mode)
    setNicknameInput('')
    setPasswordInput('')
  }

  function handleAuthSubmit(e) {
    e.preventDefault()
    const cleanName = nicknameInput.trim()
    if (!cleanName || !passwordInput.trim()) {
      alert('닉네임과 비밀번호를 모두 입력해주세요.')
      return
    }

    setCurrentUser({ nickname: cleanName })
    setAuthModal(null)
    setNicknameInput('')
    setPasswordInput('')
  }

  function handleLogout() {
    setCurrentUser(null)
  }

  function selectMenu(menu) {
    setActiveMenu(menu)
    setActiveGame(null)
    setViewMode('list')
    setSelectedPostId(null)
  }

  function selectGame(game) {
    setActiveGame(game)
    setActiveMenu('전체글')
    setViewMode('list')
    setSelectedPostId(null)
  }

  async function handlePostClick(post) {
    const nextViews = (post.views || 0) + 1
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, views: nextViews } : p))
    )
    setSelectedPostId(post.id)
    setCommentInput('')
    setViewMode('detail')

    await supabase
      .from('posts')
      .update({ views: nextViews })
      .eq('id', post.id)
  }

  async function handleCreatePost(e) {
    e.preventDefault()
    if (!newTitle.trim() || !newContent.trim()) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    const authorName = currentUser ? currentUser.nickname : '익명 문파원'

    const { data, error } = await supabase
      .from('posts')
      .insert([
        {
          game: newGame,
          title: newTitle.trim(),
          content: newContent.trim(),
          author: authorName,
          likes: 0,
          views: 1,
          type: '최신글',
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
    setNewContent('')
    setSearchQuery('')
    setViewMode('list')
    setActiveMenu('전체글')
    setActiveGame(null)
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('정말 이 게시글을 삭제할까요?')) return

    await supabase.from('comments').delete().eq('post_id', postId)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      alert('게시글 삭제 중 오류가 발생했습니다.')
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
      alert('댓글 삭제 중 오류가 발생했습니다.')
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
              className={activeMenu === menu && !activeGame && viewMode === 'list' ? 'active' : ''}
              onClick={() => selectMenu(menu)}
            >
              {menu}
            </a>
          ))}
        </nav>

        <div className="account">
          {currentUser ? (
            <>
              <span className="user-badge">{currentUser.nickname}님</span>
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
              <form className="write-form" onSubmit={handleCreatePost}>
                <h2>✍️ 새 게시글 작성</h2>
                <select value={newGame} onChange={e => setNewGame(e.target.value)}>
                  {games.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="제목을 입력하세요"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
                <textarea
                  rows="8"
                  placeholder="내용을 입력하세요"
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                />
                <div className="form-actions">
                  <button type="button" className="login" onClick={() => setViewMode('list')}>
                    취소
                  </button>
                  <button type="submit" className="signup">
                    등록하기
                  </button>
                </div>
              </form>
            )}

            {viewMode === 'detail' && selectedPost && (
              <div className="post-detail">
                <div className="detail-top">
                  <span className="badge">{selectedPost.game}</span>
                  {myPostIds.includes(selectedPost.id) && (
                    <button
                      className="delete-btn"
                      onClick={() => handleDeletePost(selectedPost.id)}
                    >
                      삭제하기
                    </button>
                  )}
                </div>
                <h2>{selectedPost.title}</h2>
                <small>
                  작성자 {selectedPost.author || '익명 문파원'} · 조회{' '}
                  {(selectedPost.views || 0).toLocaleString()} · 추천 {selectedPost.likes || 0} · 댓글{' '}
                  {selectedPost.commentList.length}
                </small>
                <hr />
                <p className="post-body">{selectedPost.content}</p>

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
                        {myCommentIds.includes(comment.id) && (
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
                    {activeGame
                      ? `🎮 ${activeGame} 게시판`
                      : activeMenu === '공지사항'
                        ? '📢 공지사항'
                        : activeMenu === '인기글'
                          ? '🔥 인기 게시글'
                          : activeMenu === '최신글'
                            ? '📝 최신 게시글'
                            : '📋 전체 게시글'}
                  </h2>
                  {activeMenu !== '공지사항' && (
                    <button className="signup" onClick={() => setViewMode('write')}>
                      글쓰기
                    </button>
                  )}
                </div>

                {activeMenu !== '공지사항' && (
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
                )}

                {loading ? (
                  <p>게시글을 불러오는 중...</p>
                ) : activeMenu === '공지사항' ? (
                  <div className="post">
                    <span>운영진</span>
                    <strong>GAME COMMUNITY에 오신 것을 환영합니다!</strong>
                    <small>공지사항</small>
                  </div>
                ) : visiblePosts.length > 0 ? (
                  visiblePosts.map(post => (
                    <div
                      className="post clickable"
                      key={post.id}
                      onClick={() => handlePostClick(post)}
                    >
                      <span>
                        {post.game} · {post.author || '익명 문파원'}
                        {myPostIds.includes(post.id) ? ' (내 글)' : ''}
                      </span>
                      <strong>{post.title}</strong>
                      <small>
                        추천 {post.likes || 0} · 댓글 {post.commentList.length} · 조회{' '}
                        {(post.views || 0).toLocaleString()}
                      </small>
                    </div>
                  ))
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
            <h2>🎮 게임 커뮤니티</h2>

            {games.map(game => (
              <div
                className={`game ${activeGame === game ? 'selected' : ''}`}
                key={game}
                onClick={() => selectGame(game)}
              >
                {game} <b>›</b>
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