/* ===========================================
   main.js — 페이지 초기화 진입점 (모든 모듈 로드 후 실행)
   =========================================== */
window.addEventListener('load', function() {
  // 기본 지표 로드: 소비심리지수 (grp1 첫 번째 버튼)
  var defaultBtn = document.querySelector('#grp1 .sub-btn');
  if(defaultBtn) selChartWithAPI('csi', defaultBtn, 'grp1');

  // 연구기관 보고서 동적 로드
  loadReports();

  // 뉴스 섹션 동적 로드 (news.json)
  loadNews();

  // 리사이저
  var resizer = document.getElementById('resizer');
  var sidebar = document.querySelector('.sidebar');
  var isResizing = false, startX = 0, startW = 0;
  if(resizer && sidebar) {
    resizer.addEventListener('mousedown', function(e){
      isResizing=true; startX=e.clientX; startW=sidebar.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor='col-resize';
      document.body.style.userSelect='none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
      if(!isResizing) return;
      var newW = Math.min(Math.max(startW+(e.clientX-startX),200),window.innerWidth*0.6);
      sidebar.style.width = newW+'px';
      if(mc) mc.resize();
    });
    document.addEventListener('mouseup', function(){
      if(!isResizing) return;
      isResizing=false;
      resizer.classList.remove('dragging');
      document.body.style.cursor='';
      document.body.style.userSelect='';
    });
  }
  // 날씨 달력 초기화
  wxInit();

  // 관광 방문자 초기화
  tourInit();
});

