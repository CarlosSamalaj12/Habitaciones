/* =========================
   MOBILE LAYOUT ADJUST
========================= */
function adjustMobileLayout() {
  const isMobile = window.innerWidth <= 767;
  const $summary = $('#summaryBar');
  const $progAll = $('#summaryProgressAll');
  const $modulesBar = document.querySelector('.modulesBar');
  const $logoBox = document.querySelector('.logoBox');
  const $brand = document.querySelector('.brand');

  if (!$summary || !$progAll || !$modulesBar) return;

  const alreadyMobile = $summary.dataset.mobilePlaced === '1';

  if (isMobile && !alreadyMobile) {
    const $row = document.createElement('div');
    $row.className = 'summaryRow';
    $modulesBar.after($row);

    const $pillsRow = document.createElement('div');
    $pillsRow.className = 'pillsRow';
    $pillsRow.appendChild($summary);
    $row.appendChild($pillsRow);

    const $bottomRow = document.createElement('div');
    $bottomRow.className = 'summaryBottomRow';
    $bottomRow.appendChild($progAll);
    if ($logoBox) {
      $logoBox.classList.add('logo-moved');
      $bottomRow.appendChild($logoBox);
    }
    $row.appendChild($bottomRow);

    $summary.dataset.mobilePlaced = '1';
    $progAll.dataset.mobilePlaced = '1';
    document.body.classList.add('layout-mobile');
  } else if (!isMobile && alreadyMobile) {
    const $userLabel = $('#activeUserLabel');
    const $subtitle = document.querySelector('.brandText > .t2:not(#activeUserLabel)');
    const $row = document.querySelector('.summaryRow');
    if ($row) {
      if ($summary && $logoBox) {
        $summary.appendChild($logoBox);
        $logoBox.classList.remove('logo-moved');
      }
      // Reinsert summary y progress en su lugar original (despues del subtitulo)
      if ($subtitle) {
        $subtitle.after($summary);
        $summary.after($progAll);
      } else if ($userLabel) {
        $userLabel.closest('.titleRow').after($summary);
        $summary.after($progAll);
      }
      $row.remove();
    }
    delete $summary.dataset.mobilePlaced;
    delete $progAll.dataset.mobilePlaced;
    document.body.classList.remove('layout-mobile');
  }
}
