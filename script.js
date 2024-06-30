window.onload = function() {
    var dimensionsDiv = document.getElementById('dimensions');
    dimensionsDiv.innerHTML = 'Width: ' + window.innerWidth + 'px, Height: ' + window.innerHeight + 'px';
    // Atualiza as variáveis CSS com as dimensões da tela
    document.documentElement.style.setProperty('--screen-width', window.innerWidth + 'px');
    document.documentElement.style.setProperty('--screen-height', window.innerHeight + 'px');
}
function abrirModal (){
    const modal = document.getElementById('janela-modal')
    modal.classList.add('abrir')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar' || e.target.id == 'janela-modal')
        modal.classList.remove('abrir')
    })
}
function abrirModal1 (){
    const modal = document.getElementById('janela-modal1')
    modal.classList.add('abrir1')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar1' || e.target.id == 'janela-modal1')
        modal.classList.remove('abrir1')
    })
}
function abrirModal2 (){
    const modal = document.getElementById('janela-modal2')
    modal.classList.add('abrir2')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar2' || e.target.id == 'janela-modal2')
        modal.classList.remove('abrir2')
    })
}
function abrirModal3 (){
    const modal = document.getElementById('janela-modal3')
    modal.classList.add('abrir3')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar3' || e.target.id == 'janela-modal3')
        modal.classList.remove('abrir3')
    })
}
function abrirModal4 (){
    const modal = document.getElementById('janela-modal4')
    modal.classList.add('abrir4')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar4' || e.target.id == 'janela-modal4')
        modal.classList.remove('abrir4')
    })
}
function abrirModal5 (){
    const modal = document.getElementById('janela-modal5')
    modal.classList.add('abrir5')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar5' || e.target.id == 'janela-modal5')
        modal.classList.remove('abrir5')
    })
}
function abrirModal6 (){
    const modal = document.getElementById('janela-modal6')
    modal.classList.add('abrir6')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar6' || e.target.id == 'janela-modal6')
        modal.classList.remove('abrir6')
    })
}
function abrirModal7 (){
    const modal = document.getElementById('janela-modal7')
    modal.classList.add('abrir7')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar7' || e.target.id == 'janela-modal7')
        modal.classList.remove('abrir7')
    })
}
function abrirModal8 (){
    const modal = document.getElementById('janela-modal8')
    modal.classList.add('abrir8')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar8' || e.target.id == 'janela-modal8')
        modal.classList.remove('abrir8')
    })
}
function abrirModal9 (){
    const modal = document.getElementById('janela-modal9')
    modal.classList.add('abrir9')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar9' || e.target.id == 'janela-modal9')
        modal.classList.remove('abrir9')
    })
}
function abrir1Modal (){
    const modal = document.getElementById('janela-modal10')
    modal.classList.add('abrir10')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar10' || e.target.id == 'janela-modal10')
        modal.classList.remove('abrir10')
    })
}
function abrir2Modal (){
    const modal = document.getElementById('janela-modal11')
    modal.classList.add('abrir11')

    modal.addEventListener('click', (e) => {
        if(e.target.id == 'fechar11' || e.target.id == 'janela-modal11')
        modal.classList.remove('abrir11')
    })
}