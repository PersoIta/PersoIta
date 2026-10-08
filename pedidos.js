let clients = [];
let products = [];
let variations = [];
let orders = [];
let currentOrderItems = [];
let editingOrderId = null;

function orderMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function orderNumber(value) {
  return Number(value || 0);
}

function getNumberValue(id) {
  const element = document.getElementById(id);

  if (!element) {
    return 0;
  }

  return Number(
    String(element.value || "").replace(",", ".")
  ) || 0;
}

function getToday() {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");
}

function isPending(order) {
  if (!order) {
    return false;
  }

  const status = String(
    order.status || ""
  )
    .trim()
    .toLowerCase();

  return (
    status === "pendente" ||
    status === "pending"
  );
}

async function loadClients() {
  const {
    data,
    error
  } = await db
    .from("gestao_loja_clientes")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw error;
  }

  clients = data || [];
}

async function loadProducts() {
  const {
    data,
    error
  } = await db
    .from("gestao_loja_produtos")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw error;
  }

  products = data || [];
}

async function loadVariations() {
  const {
    data,
    error
  } = await db
    .from("gestao_loja_produtos_variacoes")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw error;
  }

  variations = data || [];
}

async function loadOrders() {
  const {
    data,
    error
  } = await db
    .from("gestao_loja_pedidos")
    .select(`
      *,
      gestao_loja_clientes (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj
      )
    `)
    .eq("id_loja", currentStore.id_loja)
    .order("id", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  orders = data || [];

  renderOrders();
}

function renderOrders() {
  const container =
    document.getElementById(
      "ordersContainer"
    );

  if (!container) {
    return;
  }

  if (!orders.length) {
    container.innerHTML = `
      <div class="card">
        <h3>
          Nenhum pedido cadastrado
        </h3>

        <p class="muted">
          Clique em "+ Novo pedido"
          para cadastrar o primeiro pedido.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div
      class="card"
      style="
        padding:0;
        overflow:auto;
      "
    >
      <table class="table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Cliente</th>
            <th>Data</th>
            <th>Status</th>
            <th>Valor</th>
            <th style="text-align:right;">
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          ${orders.map(order => {
            const client =
              order.gestao_loja_clientes;

            const clientName =
              client?.nome ||
              "Cliente não informado";

            return `
              <tr>
                <td>
                  <strong>
                    #${order.numero || order.id}
                  </strong>
                </td>

                <td>
                  ${escapeHtml(clientName)}
                </td>

                <td>
                  ${formatDate(
                    order.data_pedido
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    order.status ||
                    "Pendente"
                  )}
                </td>

                <td>
                  <strong>
                    ${orderMoney(
                      order.valor_total
                    )}
                  </strong>
                </td>

                <td style="text-align:right;">
                  <button
                    class="btn btn-secondary"
                    onclick="viewOrder(${order.id})"
                  >
                    Visualizar
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildClientOptions(
  selectedId = ""
) {
  return `
    <option value="">
      Selecione o cliente
    </option>

    ${clients.map(client => `
      <option
        value="${client.id}"
        ${
          String(client.id) ===
          String(selectedId)
            ? "selected"
            : ""
        }
      >
        ${escapeHtml(client.nome)}
      </option>
    `).join("")}
  `;
}

function buildProductOptions(
  selectedId = ""
) {
  return `
    <option value="">
      Selecione o produto
    </option>

    ${products.map(product => `
      <option
        value="${product.id}"
        ${
          String(product.id) ===
          String(selectedId)
            ? "selected"
            : ""
        }
      >
        ${escapeHtml(product.nome)}
      </option>
    `).join("")}
  `;
}

function buildOrderForm() {
  return `
    <div
      style="
        display:grid;
        grid-template-columns:repeat(2,1fr);
        gap:15px;
      "
    >
      <div>
        <label>Cliente</label>

        <select
          id="orderClient"
          onchange="changeOrderClient(this.value)"
        >
          ${buildClientOptions()}
        </select>
      </div>

      <div>
        <label>Data do pedido</label>

        <input
          type="date"
          id="orderDate"
        >
      </div>
    </div>

    <div
      style="
        margin-top:20px;
        padding:15px;
        border:1px solid #ddd;
        border-radius:8px;
      "
    >
      <strong>
        Endereço de entrega
      </strong>

      <div
        class="muted"
        style="
          font-size:13px;
          margin-top:4px;
          margin-bottom:15px;
        "
      >
        O endereço será preenchido automaticamente
        pelo cadastro do cliente e poderá ser editado.
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:1fr 2fr 1fr;
          gap:15px;
        "
      >
        <div>
          <label>CEP</label>

          <input
            type="text"
            id="orderCep"
            placeholder="00000-000"
          >
        </div>

        <div>
          <label>Endereço</label>

          <input
            type="text"
            id="orderAddress"
            placeholder="Rua, avenida..."
          >
        </div>

        <div>
          <label>Número</label>

          <input
            type="text"
            id="orderNumber"
          >
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:1fr 1fr 1fr;
          gap:15px;
          margin-top:15px;
        "
      >
        <div>
          <label>Complemento</label>

          <input
            type="text"
            id="orderComplement"
          >
        </div>

        <div>
          <label>Bairro</label>

          <input
            type="text"
            id="orderNeighborhood"
          >
        </div>

        <div>
          <label>Cidade</label>

          <input
            type="text"
            id="orderCity"
          >
        </div>
      </div>

      <div
        style="
          width:150px;
          margin-top:15px;
        "
      >
        <label>Estado</label>

        <input
          type="text"
          id="orderState"
          maxlength="2"
          placeholder="MG"
        >
      </div>
    </div>

    <div style="margin-top:25px;">
      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:15px;
        "
      >
        <h3 style="margin:0;">
          Produtos do pedido
        </h3>

        <button
          type="button"
          class="btn btn-primary"
          onclick="addOrderItem()"
        >
          + Adicionar produto
        </button>
      </div>

      <div id="orderItems"></div>
    </div>

    <div
      style="
        display:grid;
        grid-template-columns:repeat(2,1fr);
        gap:15px;
        margin-top:20px;
      "
    >
      <div>
        <label>Prazo de entrega</label>

        <input
          type="text"
          id="orderDeliveryDeadline"
          placeholder="Ex.: 5 dias"
        >
      </div>

      <div>
        <label>Forma de pagamento</label>

        <input
          type="text"
          id="orderPayment"
          placeholder="Ex.: PIX, dinheiro, cartão..."
        >
      </div>
    </div>

    <div
      style="
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:15px;
        margin-top:20px;
      "
    >
      <div>
        <label>Desconto</label>

        <input
          type="number"
          id="orderDiscount"
          value="0"
          min="0"
          step="0.01"
          oninput="updateOrderSummary()"
        >
      </div>

      <div>
        <label>Acréscimo</label>

        <input
          type="number"
          id="orderIncrease"
          value="0"
          min="0"
          step="0.01"
          oninput="updateOrderSummary()"
        >
      </div>

      <div>
        <label>Mão de obra</label>

        <input
          type="number"
          id="orderLabor"
          value="0"
          min="0"
          step="0.01"
          oninput="updateOrderSummary()"
        >
      </div>

      <div>
        <label>Frete</label>

        <input
          type="number"
          id="orderFreight"
          value="0"
          min="0"
          step="0.01"
          oninput="updateOrderSummary()"
        >
      </div>
    </div>

    <div style="margin-top:20px;">
      <label>Observações</label>

      <textarea
        id="orderNotes"
        rows="4"
        placeholder="Observações do pedido..."
      ></textarea>
    </div>

    <div
      style="
        margin-top:20px;
        padding:20px;
        background:#f5f5f5;
        border-radius:8px;
      "
    >
      <div class="order-summary-row">
        <span>Subtotal</span>

        <strong id="summarySubtotal">
          R$ 0,00
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Mão de obra</span>

        <strong id="summaryLabor">
          R$ 0,00
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Frete</span>

        <strong id="summaryFreight">
          R$ 0,00
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Acréscimo</span>

        <strong id="summaryIncrease">
          R$ 0,00
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Desconto</span>

        <strong id="summaryDiscount">
          R$ 0,00
        </strong>
      </div>

      <hr>

      <div
        class="order-summary-row"
        style="font-size:20px;"
      >
        <strong>Total</strong>

        <strong id="summaryTotal">
          R$ 0,00
        </strong>
      </div>
    </div>

    <div
      style="
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:25px;
      "
    >
      <button
        type="button"
        class="btn btn-secondary"
        onclick="closeModal()"
      >
        Cancelar
      </button>

      <button
        type="button"
        class="btn btn-primary"
        onclick="saveOrder()"
      >
        Salvar pedido
      </button>
    </div>
  `;
}

function openNewOrder() {
  editingOrderId = null;
  currentOrderItems = [];

  const modal =
    document.getElementById("modal");

  modal.classList.remove("hidden");

  document.querySelector(
    ".modal-card"
  ).style.maxWidth = "900px";

  document.getElementById(
    "modalTitle"
  ).textContent = "Novo pedido";

  document.getElementById(
    "modalContent"
  ).innerHTML = buildOrderForm();

  document.getElementById(
    "orderDate"
  ).value = getToday();

  renderOrderItems();
  updateOrderSummary();
}

function changeOrderClient(clientId) {
  const client =
    clients.find(
      item =>
        String(item.id) ===
        String(clientId)
    );

  const ids = [
    "orderCep",
    "orderAddress",
    "orderNumber",
    "orderComplement",
    "orderNeighborhood",
    "orderCity",
    "orderState"
  ];

  if (!client) {
    ids.forEach(id => {
      const element =
        document.getElementById(id);

      if (element) {
        element.value = "";
      }
    });

    return;
  }

  document.getElementById(
    "orderCep"
  ).value = client.cep || "";

  document.getElementById(
    "orderAddress"
  ).value = client.endereco || "";

  document.getElementById(
    "orderNumber"
  ).value = client.numero || "";

  document.getElementById(
    "orderComplement"
  ).value =
    client.complemento || "";

  document.getElementById(
    "orderNeighborhood"
  ).value =
    client.bairro || "";

  document.getElementById(
    "orderCity"
  ).value =
    client.cidade || "";

  document.getElementById(
    "orderState"
  ).value =
    client.estado || "";
}

function addOrderItem() {
  currentOrderItems.push({
    produto_id: "",
    variacao_id: "",
    quantidade: 1,
    preco_unitario: 0,
    desconto: 0,
    observacao: ""
  });

  renderOrderItems();
  updateOrderSummary();
}

function removeOrderItem(index) {
  currentOrderItems.splice(
    index,
    1
  );

  renderOrderItems();
  updateOrderSummary();
}

function renderOrderItems() {
  const container =
    document.getElementById(
      "orderItems"
    );

  if (!container) {
    return;
  }

  if (!currentOrderItems.length) {
    container.innerHTML = `
      <div
        style="
          padding:20px;
          text-align:center;
          border:1px dashed #ccc;
          border-radius:8px;
        "
      >
        <span class="muted">
          Nenhum produto adicionado ao pedido.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    currentOrderItems.map(
      (item, index) => {
        const productVariations =
          variations.filter(
            variation =>
              String(
                variation.produto_id
              ) ===
              String(
                item.produto_id
              )
          );

        const itemSubtotal =
          (
            Number(
              item.quantidade
            ) || 0
          ) *
          (
            Number(
              item.preco_unitario
            ) || 0
          ) -
          (
            Number(
              item.desconto
            ) || 0
          );

        return `
          <div
            style="
              padding:15px;
              border:1px solid #ddd;
              border-radius:8px;
              margin-bottom:15px;
            "
          >
            <div
              style="
                display:grid;
                grid-template-columns:2fr 2fr 1fr 1fr auto;
                gap:10px;
                align-items:end;
              "
            >
              <div>
                <label>Produto</label>

                <select
                  onchange="
                    changeItemProduct(
                      ${index},
                      this.value
                    )
                  "
                >
                  ${buildProductOptions(
                    item.produto_id
                  )}
                </select>
              </div>

              <div>
                <label>Variação</label>

                <select
                  onchange="
                    changeItemVariation(
                      ${index},
                      this.value
                    )
                  "
                  ${
                    !productVariations.length
                      ? "disabled"
                      : ""
                  }
                >
                  <option value="">
                    ${
                      productVariations.length
                        ? "Selecione"
                        : "Sem variação"
                    }
                  </option>

                  ${productVariations.map(
                    variation => `
                      <option
                        value="${variation.id}"
                        ${
                          String(
                            variation.id
                          ) ===
                          String(
                            item.variacao_id
                          )
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHtml(
                          variation.nome
                        )}
                      </option>
                    `
                  ).join("")}
                </select>
              </div>

              <div>
                <label>Quantidade</label>

                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value="${item.quantidade}"
                  onchange="
                    changeItemQuantity(
                      ${index},
                      this.value
                    )
                  "
                >
              </div>

              <div>
                <label>
                  Preço unitário
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value="${item.preco_unitario}"
                  onchange="
                    changeItemPrice(
                      ${index},
                      this.value
                    )
                  "
                >
              </div>

              <button
                type="button"
                class="btn btn-danger"
                onclick="
                  removeOrderItem(
                    ${index}
                  )
                "
              >
                ×
              </button>
            </div>

            <div style="margin-top:10px;">
              <label>
                Observação do item
              </label>

              <input
                type="text"
                value="${escapeHtml(
                  item.observacao || ""
                )}"
                onchange="
                  changeItemObservation(
                    ${index},
                    this.value
                  )
                "
                placeholder="Observação..."
              >
            </div>

            <div
              style="
                text-align:right;
                margin-top:10px;
              "
            >
              <strong>
                Subtotal:
                ${orderMoney(itemSubtotal)}
              </strong>
            </div>
          </div>
        `;
      }
    ).join("");
}

function changeItemProduct(
  index,
  productId
) {
  const item =
    currentOrderItems[index];

  if (!item) {
    return;
  }

  item.produto_id = productId;
  item.variacao_id = "";

  const product =
    products.find(
      product =>
        String(product.id) ===
        String(productId)
    );

  item.preco_unitario =
    product
      ? Number(
          product.preco_venda
        ) || 0
      : 0;

  renderOrderItems();
  updateOrderSummary();
}

function changeItemVariation(
  index,
  variationId
) {
  const item =
    currentOrderItems[index];

  if (!item) {
    return;
  }

  item.variacao_id =
    variationId;

  if (variationId) {
    const variation =
      variations.find(
        variation =>
          String(
            variation.id
          ) ===
          String(
            variationId
          )
      );

    if (variation) {
      item.preco_unitario =
        Number(
          variation.preco_venda
        ) || 0;
    }
  } else {
    const product =
      products.find(
        product =>
          String(product.id) ===
          String(item.produto_id)
      );

    if (product) {
      item.preco_unitario =
        Number(
          product.preco_venda
        ) || 0;
    }
  }

  renderOrderItems();
  updateOrderSummary();
}

function changeItemQuantity(
  index,
  value
) {
  if (!currentOrderItems[index]) {
    return;
  }

  currentOrderItems[index]
    .quantidade =
    Number(value) || 0;

  renderOrderItems();
  updateOrderSummary();
}

function changeItemPrice(
  index,
  value
) {
  if (!currentOrderItems[index]) {
    return;
  }

  currentOrderItems[index]
    .preco_unitario =
    Number(value) || 0;

  renderOrderItems();
  updateOrderSummary();
}

function changeItemObservation(
  index,
  value
) {
  if (!currentOrderItems[index]) {
    return;
  }

  currentOrderItems[index]
    .observacao = value;
}

function updateOrderSummary() {
  let subtotal = 0;

  currentOrderItems.forEach(
    item => {
      subtotal +=
        (
          Number(
            item.quantidade
          ) || 0
        ) *
        (
          Number(
            item.preco_unitario
          ) || 0
        ) -
        (
          Number(
            item.desconto
          ) || 0
        );
    }
  );

  const discount =
    getNumberValue(
      "orderDiscount"
    );

  const increase =
    getNumberValue(
      "orderIncrease"
    );

  const labor =
    getNumberValue(
      "orderLabor"
    );

  const freight =
    getNumberValue(
      "orderFreight"
    );

  const total =
    subtotal +
    labor +
    freight +
    increase -
    discount;

  const values = {
    summarySubtotal: subtotal,
    summaryLabor: labor,
    summaryFreight: freight,
    summaryIncrease: increase,
    summaryDiscount: discount,
    summaryTotal: Math.max(
      total,
      0
    )
  };

  Object.keys(values).forEach(
    id => {
      const element =
        document.getElementById(id);

      if (element) {
        element.textContent =
          orderMoney(
            values[id]
          );
      }
    }
  );
}

function getDeliveryAddress() {
  const cep =
    document.getElementById(
      "orderCep"
    )?.value.trim() || "";

  const address =
    document.getElementById(
      "orderAddress"
    )?.value.trim() || "";

  const number =
    document.getElementById(
      "orderNumber"
    )?.value.trim() || "";

  const complement =
    document.getElementById(
      "orderComplement"
    )?.value.trim() || "";

  const neighborhood =
    document.getElementById(
      "orderNeighborhood"
    )?.value.trim() || "";

  const city =
    document.getElementById(
      "orderCity"
    )?.value.trim() || "";

  const state =
    document.getElementById(
      "orderState"
    )?.value.trim() || "";

  const lines = [];

  if (cep) {
    lines.push(
      `CEP: ${cep}`
    );
  }

  if (address) {
    let line =
      `Endereço: ${address}`;

    if (number) {
      line +=
        `, Nº ${number}`;
    }

    lines.push(line);
  }

  if (complement) {
    lines.push(
      `Complemento: ${complement}`
    );
  }

  if (neighborhood) {
    lines.push(
      `Bairro: ${neighborhood}`
    );
  }

  if (city || state) {
    lines.push(
      `Cidade: ${city}${
        state
          ? " - " + state
          : ""
      }`
    );
  }

  return lines.join("\n");
}

async function saveOrder() {
  if (!currentOrderItems.length) {
    alert("Adicione pelo menos um produto ao pedido.");
    return;
  }

  const clientId = document.getElementById("orderClient").value;

  if (!clientId) {
    alert("Selecione um cliente.");
    return;
  }

  for (const item of currentOrderItems) {
    if (!item.produto_id) {
      alert("Selecione o produto de todos os itens.");
      return;
    }

    if (!item.quantidade || Number(item.quantidade) <= 0) {
      alert("Informe uma quantidade válida para todos os produtos.");
      return;
    }
  }

  const subtotal = currentOrderItems.reduce((total, item) => {
    const quantidade = Number(item.quantidade) || 0;
    const precoUnitario = Number(item.preco_unitario) || 0;
    const descontoItem = Number(item.desconto) || 0;

    const subtotalItem =
      quantidade * precoUnitario - descontoItem;

    return total + subtotalItem;
  }, 0);

  const desconto = getNumberValue("orderDiscount");
  const acrescimo = getNumberValue("orderIncrease");
  const maoDeObra = getNumberValue("orderLabor");
  const frete = getNumberValue("orderFreight");

  const valorTotal = Math.max(
    subtotal -
      desconto +
      acrescimo +
      frete +
      maoDeObra,
    0
  );

  const subtotalFinal = Number(subtotal.toFixed(2));
  const descontoFinal = Number(desconto.toFixed(2));
  const acrescimoFinal = Number(acrescimo.toFixed(2));
  const freteFinal = Number(frete.toFixed(2));
  const maoDeObraFinal = Number(maoDeObra.toFixed(2));
  const valorTotalFinal = Number(valorTotal.toFixed(2));

  const orderData = {
    id_loja: currentStore.id_loja,
    cliente_id: Number(clientId),
    data_pedido: document.getElementById("orderDate").value,
    status: "Pendente",
    subtotal: subtotalFinal,
    desconto: descontoFinal,
    acrescimo: acrescimoFinal,
    frete: freteFinal,
    mao_de_obra: maoDeObraFinal,
    valor_total: valorTotalFinal,
    prazo_entrega: document
      .getElementById("orderDeliveryDeadline")
      .value
      .trim(),
    forma_pagamento: document
      .getElementById("orderPayment")
      .value
      .trim(),
    endereco_entrega: getDeliveryAddress(),
    observacoes: document
      .getElementById("orderNotes")
      .value
      .trim()
  };

  if (editingOrderId) {
    const {
      data: updatedOrder,
      error: orderError
    } = await db
      .from("gestao_loja_pedidos")
      .update(orderData)
      .eq("id", editingOrderId)
      .eq("id_loja", currentStore.id_loja)
      .select()
      .single();

    if (orderError) {
      alert(
        "Erro ao atualizar pedido:\n" +
        orderError.message
      );
      return;
    }

    const {
      error: deleteItemsError
    } = await db
      .from("gestao_loja_pedidos_itens")
      .delete()
      .eq("pedido_id", editingOrderId);

    if (deleteItemsError) {
      alert(
        "Erro ao atualizar os itens:\n" +
        deleteItemsError.message
      );
      return;
    }

    const itemsData = currentOrderItems.map((item) => {
      const quantidade = Number(item.quantidade) || 0;
      const precoUnitario = Number(item.preco_unitario) || 0;
      const descontoItem = Number(item.desconto) || 0;

      const subtotalItem =
        quantidade * precoUnitario - descontoItem;

      return {
        id_loja: currentStore.id_loja,
        pedido_id: updatedOrder.id,
        produto_id: Number(item.produto_id),
        variacao_id: item.variacao_id
          ? Number(item.variacao_id)
          : null,
        quantidade: quantidade,
        preco_unitario: precoUnitario,
        desconto: descontoItem,
        subtotal: Number(subtotalItem.toFixed(2)),
        observacao: item.observacao || null
      };
    });

    const {
      error: itemsError
    } = await db
      .from("gestao_loja_pedidos_itens")
      .insert(itemsData);

    if (itemsError) {
      alert(
        "Erro ao salvar os itens do pedido:\n" +
        itemsError.message
      );
      return;
    }

    /*
     * Atualiza novamente o pedido depois dos itens.
     * Isso garante que qualquer trigger ou alteração
     * causada pela atualização dos itens não deixe
     * o valor_total antigo.
     */
    const {
      error: finalUpdateError
    } = await db
      .from("gestao_loja_pedidos")
      .update({
        subtotal: subtotalFinal,
        desconto: descontoFinal,
        acrescimo: acrescimoFinal,
        frete: freteFinal,
        mao_de_obra: maoDeObraFinal,
        valor_total: valorTotalFinal
      })
      .eq("id", editingOrderId)
      .eq("id_loja", currentStore.id_loja);

    if (finalUpdateError) {
      alert(
        "Os itens foram atualizados, mas ocorreu um erro ao atualizar o valor total:\n" +
        finalUpdateError.message
      );
      return;
    }

    const {
      data: orderConfirmation,
      error: confirmationError
    } = await db
      .from("gestao_loja_pedidos")
      .select(
        "subtotal, desconto, acrescimo, frete, mao_de_obra, valor_total"
      )
      .eq("id", editingOrderId)
      .eq("id_loja", currentStore.id_loja)
      .single();

    if (confirmationError) {
      alert(
        "Pedido atualizado, mas não foi possível confirmar o valor total:\n" +
        confirmationError.message
      );
      return;
    }

    console.log("Valores calculados:", {
      subtotal: subtotalFinal,
      desconto: descontoFinal,
      acrescimo: acrescimoFinal,
      frete: freteFinal,
      maoDeObra: maoDeObraFinal,
      valorTotal: valorTotalFinal
    });

    console.log(
      "Valores gravados no Supabase:",
      orderConfirmation
    );

    editingOrderId = null;
    currentOrderItems = [];

    closeModal();

    await loadOrders();

    alert(
      "Pedido atualizado com sucesso.\n\n" +
      "Total: R$ " +
      valorTotalFinal
        .toFixed(2)
        .replace(".", ",")
    );

    return;
  }

  const {
    data: order,
    error
  } = await db
    .from("gestao_loja_pedidos")
    .insert(orderData)
    .select()
    .single();

  if (error) {
    alert(
      "Erro ao salvar pedido:\n" +
      error.message
    );
    return;
  }

  const itemsData = currentOrderItems.map((item) => {
    const quantidade = Number(item.quantidade) || 0;
    const precoUnitario = Number(item.preco_unitario) || 0;
    const descontoItem = Number(item.desconto) || 0;

    const subtotalItem =
      quantidade * precoUnitario - descontoItem;

    return {
      id_loja: currentStore.id_loja,
      pedido_id: order.id,
      produto_id: Number(item.produto_id),
      variacao_id: item.variacao_id
        ? Number(item.variacao_id)
        : null,
      quantidade: quantidade,
      preco_unitario: precoUnitario,
      desconto: descontoItem,
      subtotal: Number(subtotalItem.toFixed(2)),
      observacao: item.observacao || null
    };
  });

  const {
    error: itemsError
  } = await db
    .from("gestao_loja_pedidos_itens")
    .insert(itemsData);

  if (itemsError) {
    await db
      .from("gestao_loja_pedidos")
      .delete()
      .eq("id", order.id);

    alert(
      "Erro ao salvar os itens do pedido:\n" +
      itemsError.message
    );
    return;
  }

  /*
   * Garante também que o pedido recém-criado
   * fique com o valor_total correto depois da
   * inserção dos itens.
   */
  const {
    error: finalInsertUpdateError
  } = await db
    .from("gestao_loja_pedidos")
    .update({
      subtotal: subtotalFinal,
      desconto: descontoFinal,
      acrescimo: acrescimoFinal,
      frete: freteFinal,
      mao_de_obra: maoDeObraFinal,
      valor_total: valorTotalFinal
    })
    .eq("id", order.id)
    .eq("id_loja", currentStore.id_loja);

  if (finalInsertUpdateError) {
    alert(
      "Pedido criado, mas ocorreu um erro ao atualizar o valor total:\n" +
      finalInsertUpdateError.message
    );
    return;
  }

  closeModal();

  await loadOrders();

  alert(
    "Pedido salvo com sucesso.\n\n" +
    "Total: R$ " +
    valorTotalFinal
      .toFixed(2)
      .replace(".", ",")
  );
}

async function viewOrder(
  orderId
) {
  const {
    data: order,
    error: orderError
  } = await db
    .from(
      "gestao_loja_pedidos"
    )
    .select(`
      *,
      gestao_loja_clientes (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj
      )
    `)
    .eq(
      "id",
      orderId
    )
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .single();

  if (orderError) {
    alert(
      "Erro ao carregar pedido:\n" +
      orderError.message
    );
    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from(
      "gestao_loja_pedidos_itens"
    )
    .select(`
      *,
      gestao_loja_produtos (
        id,
        nome,
        sku
      ),
      gestao_loja_produtos_variacoes (
        id,
        nome,
        sku
      )
    `)
    .eq(
      "pedido_id",
      orderId
    )
    .order("id");

  if (itemsError) {
    alert(
      "Erro ao carregar itens:\n" +
      itemsError.message
    );
    return;
  }

  const client =
    order.gestao_loja_clientes;

  document.getElementById(
    "modal"
  ).classList.remove(
    "hidden"
  );

  document.querySelector(
    ".modal-card"
  ).style.maxWidth =
    "1100px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    `Pedido #${
      order.numero ||
      order.id
    }`;

  const itemsHtml =
    (items || []).map(
      item => {
        const product =
          item.gestao_loja_produtos;

        const variation =
          item.gestao_loja_produtos_variacoes;

        return `
          <tr>
            <td>
              ${escapeHtml(
                product?.nome ||
                "-"
              )}

              ${
                variation?.nome
                  ? `
                    <br>
                    <small class="muted">
                      ${escapeHtml(
                        variation.nome
                      )}
                    </small>
                  `
                  : ""
              }
            </td>

            <td>
              ${orderNumber(
                item.quantidade
              )}
            </td>

            <td>
              ${orderMoney(
                item.preco_unitario
              )}
            </td>

            <td>
              ${orderMoney(
                item.subtotal
              )}
            </td>

            <td>
              ${escapeHtml(
                item.observacao ||
                ""
              )}
            </td>
          </tr>
        `;
      }
    ).join("");

  document.getElementById(
    "modalContent"
  ).innerHTML = `
    <div
      style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:20px;
      "
    >
      <div class="card">
        <h3>
          Dados do pedido
        </h3>

        <p>
          <strong>Número:</strong>
          #${order.numero || order.id}
        </p>

        <p>
          <strong>Data:</strong>
          ${formatDate(
            order.data_pedido
          )}
        </p>

        <p>
          <strong>Status:</strong>
          ${escapeHtml(
            order.status ||
            "Pendente"
          )}
        </p>

        <p>
          <strong>Forma de pagamento:</strong>
          ${escapeHtml(
            order.forma_pagamento ||
            "-"
          )}
        </p>

        <p>
          <strong>Prazo de entrega:</strong>
          ${escapeHtml(
            order.prazo_entrega ||
            "-"
          )}
        </p>
      </div>

      <div class="card">
        <h3>
          Cliente
        </h3>

        <p>
          <strong>
            ${escapeHtml(
              client?.nome ||
              "Cliente não informado"
            )}
          </strong>
        </p>

        <p>
          ${escapeHtml(
            client?.cpf_cnpj ||
            ""
          )}
        </p>

        <p>
          ${escapeHtml(
            client?.telefone ||
            client?.whatsapp ||
            ""
          )}
        </p>

        <p>
          ${escapeHtml(
            client?.email ||
            ""
          )}
        </p>
      </div>
    </div>

    <div
      class="card"
      style="margin-top:20px;"
    >
      <h3>
        Endereço de entrega
      </h3>

      <div
        style="
          white-space:pre-wrap;
          margin-top:10px;
        "
      >
        ${escapeHtml(
          order.endereco_entrega ||
          "Endereço não informado."
        )}
      </div>
    </div>

    <div
      class="card"
      style="
        margin-top:20px;
        overflow:auto;
      "
    >
      <h3>
        Produtos
      </h3>

      <table
        class="table"
        style="margin-top:15px;"
      >
        <thead>
          <tr>
            <th>Produto</th>
            <th>Quantidade</th>
            <th>Preço unitário</th>
            <th>Subtotal</th>
            <th>Observação</th>
          </tr>
        </thead>

        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <div
      class="card"
      style="
        margin-top:20px;
        max-width:500px;
        margin-left:auto;
      "
    >
      <div class="order-summary-row">
        <span>Subtotal</span>

        <strong>
          ${orderMoney(
            order.subtotal
          )}
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Mão de obra</span>

        <strong>
          ${orderMoney(
            order.mao_de_obra
          )}
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Frete</span>

        <strong>
          ${orderMoney(
            order.frete
          )}
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Acréscimo</span>

        <strong>
          ${orderMoney(
            order.acrescimo
          )}
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Desconto</span>

        <strong>
          ${orderMoney(
            order.desconto
          )}
        </strong>
      </div>

      <hr>

      <div
        class="order-summary-row"
        style="font-size:20px;"
      >
        <strong>Total</strong>

        <strong>
          ${orderMoney(
            order.valor_total
          )}
        </strong>
      </div>
    </div>

    ${
      order.observacoes
        ? `
          <div
            class="card"
            style="margin-top:20px;"
          >
            <h3>
              Observações
            </h3>

            <div
              style="
                margin-top:8px;
                white-space:pre-wrap;
              "
            >
              ${escapeHtml(
                order.observacoes
              )}
            </div>
          </div>
        `
        : ""
    }

    <div
      style="
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:30px;
        flex-wrap:wrap;
      "
    >
      <button
        class="btn btn-secondary"
        onclick="
          generateOrderPDF(
            ${order.id}
          )
        "
      >
        📄 Gerar PDF
      </button>

      ${
        isPending(order)
          ? `
            <button
              class="btn btn-secondary"
              onclick="
                editOrder(
                  ${order.id}
                )
              "
            >
              Editar
            </button>

            <button
              class="btn btn-primary"
              onclick="
                confirmOrder(
                  ${order.id}
                )
              "
            >
              Confirmar pedido
            </button>

            <button
              class="btn btn-danger"
              onclick="
                cancelOrder(
                  ${order.id}
                )
              "
            >
              Cancelar pedido
            </button>
          `
          : ""
      }

      <button
        class="btn btn-secondary"
        onclick="closeModal()"
      >
        Fechar
      </button>
    </div>
  `;
}

async function editOrder(
  orderId
) {
  const {
    data: order,
    error: orderError
  } = await db
    .from(
      "gestao_loja_pedidos"
    )
    .select("*")
    .eq(
      "id",
      orderId
    )
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .single();

  if (orderError) {
    alert(
      "Erro ao carregar pedido:\n" +
      orderError.message
    );
    return;
  }

  if (!isPending(order)) {
    alert(
      "Somente pedidos pendentes podem ser editados."
    );
    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from(
      "gestao_loja_pedidos_itens"
    )
    .select("*")
    .eq(
      "pedido_id",
      orderId
    )
    .order("id");

  if (itemsError) {
    alert(
      "Erro ao carregar itens:\n" +
      itemsError.message
    );
    return;
  }

  editingOrderId =
    orderId;

  currentOrderItems =
    (items || []).map(
      item => ({
        produto_id:
          item.produto_id,

        variacao_id:
          item.variacao_id ||
          "",

        quantidade:
          Number(
            item.quantidade
          ),

        preco_unitario:
          Number(
            item.preco_unitario
          ),

        desconto:
          Number(
            item.desconto || 0
          ),

        observacao:
          item.observacao ||
          ""
      })
    );

  document.getElementById(
    "modal"
  ).classList.remove(
    "hidden"
  );

  document.querySelector(
    ".modal-card"
  ).style.maxWidth =
    "900px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    `Editar pedido #${
      order.numero ||
      order.id
    }`;

  document.getElementById(
    "modalContent"
  ).innerHTML =
    buildOrderForm();

  document.getElementById(
    "orderClient"
  ).value =
    order.cliente_id ||
    "";

  document.getElementById(
    "orderDate"
  ).value =
    order.data_pedido ||
    "";

  document.getElementById(
    "orderDeliveryDeadline"
  ).value =
    order.prazo_entrega ||
    "";

  document.getElementById(
    "orderPayment"
  ).value =
    order.forma_pagamento ||
    "";

  document.getElementById(
    "orderDiscount"
  ).value =
    Number(
      order.desconto || 0
    );

  document.getElementById(
    "orderIncrease"
  ).value =
    Number(
      order.acrescimo || 0
    );

  document.getElementById(
    "orderLabor"
  ).value =
    Number(
      order.mao_de_obra || 0
    );

  document.getElementById(
    "orderFreight"
  ).value =
    Number(
      order.frete || 0
    );

  document.getElementById(
    "orderNotes"
  ).value =
    order.observacoes ||
    "";

  changeOrderClient(
    order.cliente_id
  );

  renderOrderItems();
  updateOrderSummary();
}

async function confirmOrder(
  orderId
) {
  const {
    data: order,
    error: orderError
  } = await db
    .from(
      "gestao_loja_pedidos"
    )
    .select("*")
    .eq(
      "id",
      orderId
    )
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .single();

  if (orderError) {
    alert(
      "Erro ao carregar pedido:\n" +
      orderError.message
    );
    return;
  }

  if (!order) {
    alert(
      "Pedido não encontrado."
    );
    return;
  }

  if (!isPending(order)) {
    alert(
      "Este pedido não está pendente.\n\n" +
      "Status atual: " +
      (
        order.status ||
        "não informado"
      )
    );
    return;
  }

  const confirmed =
    confirm(
      `Deseja confirmar o pedido #${
        order.numero ||
        order.id
      }?\n\n` +

      `Valor: ${
        orderMoney(
          order.valor_total
        )
      }\n\n` +

      `Ao confirmar, o estoque será movimentado.`
    );

  if (!confirmed) {
    return;
  }

  const {
    error: rpcError
  } = await db.rpc(
    "gestao_loja_confirmar_pedido",
    {
      p_pedido_id:
        Number(orderId)
    }
  );

  if (rpcError) {
    alert(
      "Erro ao confirmar pedido:\n" +
      rpcError.message
    );
    return;
  }

  closeModal();

  await loadOrders();

  alert(
    "Pedido confirmado com sucesso."
  );
}

async function cancelOrder(
  orderId
) {
  const {
    data: order,
    error: orderError
  } = await db
    .from(
      "gestao_loja_pedidos"
    )
    .select("*")
    .eq(
      "id",
      orderId
    )
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .single();

  if (orderError) {
    alert(
      "Erro ao carregar pedido:\n" +
      orderError.message
    );
    return;
  }

  if (!order) {
    alert(
      "Pedido não encontrado."
    );
    return;
  }

  if (!isPending(order)) {
    alert(
      "Somente pedidos pendentes podem ser cancelados.\n\n" +
      "Status atual: " +
      (
        order.status ||
        "não informado"
      )
    );
    return;
  }

  const confirmed =
    confirm(
      `Deseja cancelar o pedido #${
        order.numero ||
        order.id
      }?`
    );

  if (!confirmed) {
    return;
  }

  const {
    error
  } = await db
    .from(
      "gestao_loja_pedidos"
    )
    .update({
      status:
        "Cancelado"
    })
    .eq(
      "id",
      orderId
    )
    .eq(
      "id_loja",
      currentStore.id_loja
    );

  if (error) {
    alert(
      "Erro ao cancelar pedido:\n" +
      error.message
    );
    return;
  }

  closeModal();

  await loadOrders();

  alert(
    "Pedido cancelado."
  );
}

async function generateOrderPDF(
  orderId
) {
  const {
    data: order,
    error: orderError
  } = await db
    .from(
      "gestao_loja_pedidos"
    )
    .select(`
      *,
      gestao_loja_clientes (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj
      )
    `)
    .eq(
      "id",
      orderId
    )
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .single();

  if (orderError) {
    alert(
      "Erro ao gerar PDF:\n" +
      orderError.message
    );
    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from(
      "gestao_loja_pedidos_itens"
    )
    .select(`
      *,
      gestao_loja_produtos (
        id,
        nome,
        sku
      ),
      gestao_loja_produtos_variacoes (
        id,
        nome,
        sku
      )
    `)
    .eq(
      "pedido_id",
      orderId
    )
    .order("id");

  if (itemsError) {
    alert(
      "Erro ao carregar itens para o PDF:\n" +
      itemsError.message
    );
    return;
  }

  const client =
    order.gestao_loja_clientes;

  const storeName =
    escapeHtml(
      currentStore?.nome_fantasia ||
      currentStore?.nome ||
      "Gestão Loja"
    );

  const storeDocument =
    escapeHtml(
      currentStore?.cnpj ||
      ""
    );

  const address =
    escapeHtml(
      order.endereco_entrega ||
      "-"
    ).replace(
      /\n/g,
      "<br>"
    );

  const itemsHtml =
    (items || []).map(
      item => {
        const product =
          item.gestao_loja_produtos;

        const variation =
          item.gestao_loja_produtos_variacoes;

        return `
          <tr>
            <td>
              ${escapeHtml(
                product?.nome ||
                "-"
              )}

              ${
                variation?.nome
                  ? `
                    <br>
                    <small>
                      ${escapeHtml(
                        variation.nome
                      )}
                    </small>
                  `
                  : ""
              }
            </td>

            <td>
              ${orderNumber(
                item.quantidade
              )}
            </td>

            <td>
              ${orderMoney(
                item.preco_unitario
              )}
            </td>

            <td>
              ${orderMoney(
                item.subtotal
              )}
            </td>
          </tr>
        `;
      }
    ).join("");

  const pdfWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );

  if (!pdfWindow) {
    alert(
      "O navegador bloqueou a janela do PDF. Permita pop-ups para este site."
    );
    return;
  }

  pdfWindow.document.open();

  pdfWindow.document.write(`
    <!DOCTYPE html>

    <html lang="pt-BR">

    <head>
      <meta charset="UTF-8">

      <title>
        Pedido #${
          order.numero ||
          order.id
        }
      </title>

      <style>
        * {
          box-sizing:border-box;
        }

        body {
          font-family:Arial,Helvetica,sans-serif;
          margin:0;
          padding:30px;
          color:#222;
          font-size:13px;
        }

        .header {
          display:flex;
          justify-content:space-between;
          border-bottom:2px solid #222;
          padding-bottom:15px;
          margin-bottom:20px;
        }

        .store {
          font-size:22px;
          font-weight:bold;
        }

        .title {
          text-align:right;
          font-size:22px;
          font-weight:bold;
        }

        .section {
          margin-top:20px;
        }

        .section-title {
          font-weight:bold;
          font-size:15px;
          border-bottom:1px solid #ccc;
          padding-bottom:6px;
          margin-bottom:10px;
        }

        .info-grid {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px 30px;
        }

        .info-label {
          font-weight:bold;
        }

        table {
          width:100%;
          border-collapse:collapse;
          margin-top:10px;
        }

        th,
        td {
          border:1px solid #ccc;
          padding:9px;
        }

        th {
          text-align:left;
          background:#f2f2f2;
        }

        .totals {
          width:350px;
          margin-left:auto;
          margin-top:20px;
        }

        .total-row {
          display:flex;
          justify-content:space-between;
          padding:5px 0;
        }

        .grand-total {
          font-size:20px;
          font-weight:bold;
          border-top:2px solid #222;
          margin-top:8px;
          padding-top:10px;
        }

        .observations {
          white-space:pre-wrap;
          line-height:1.5;
        }

        .footer {
          margin-top:40px;
          padding-top:15px;
          border-top:1px solid #ccc;
          text-align:center;
          font-size:11px;
          color:#666;
        }

        @media print {
          body {
            padding:10px;
          }
        }
      </style>
    </head>

    <body>

      <div class="header">

        <div>

          <div class="store">
            ${storeName}
          </div>

          ${
            storeDocument
              ? `
                <div>
                  ${storeDocument}
                </div>
              `
              : ""
          }

        </div>

        <div class="title">

          PEDIDO

          <div>
            #${
              order.numero ||
              order.id
            }
          </div>

        </div>

      </div>

      <div class="section">

        <div class="section-title">
          Dados do pedido
        </div>

        <div class="info-grid">

          <div>
            <span class="info-label">
              Cliente:
            </span>

            ${escapeHtml(
              client?.nome ||
              "-"
            )}
          </div>

          <div>
            <span class="info-label">
              Data:
            </span>

            ${formatDate(
              order.data_pedido
            )}
          </div>

          <div>
            <span class="info-label">
              Status:
            </span>

            ${escapeHtml(
              order.status ||
              "-"
            )}
          </div>

          <div>
            <span class="info-label">
              Telefone:
            </span>

            ${escapeHtml(
              client?.telefone ||
              client?.whatsapp ||
              "-"
            )}
          </div>

          <div>
            <span class="info-label">
              Forma de pagamento:
            </span>

            ${escapeHtml(
              order.forma_pagamento ||
              "-"
            )}
          </div>

          <div>
            <span class="info-label">
              Prazo de entrega:
            </span>

            ${escapeHtml(
              order.prazo_entrega ||
              "-"
            )}
          </div>

        </div>

      </div>

      <div class="section">

        <div class="section-title">
          Endereço de entrega
        </div>

        <div>
          ${address}
        </div>

      </div>

      <div class="section">

        <div class="section-title">
          Produtos
        </div>

        <table>

          <thead>

            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Valor unit.</th>
              <th>Subtotal</th>
            </tr>

          </thead>

          <tbody>
            ${itemsHtml}
          </tbody>

        </table>

      </div>

      <div class="totals">

        <div class="total-row">
          <span>Subtotal</span>

          <strong>
            ${orderMoney(
              order.subtotal
            )}
          </strong>
        </div>

        <div class="total-row">
          <span>Mão de obra</span>

          <strong>
            ${orderMoney(
              order.mao_de_obra
            )}
          </strong>
        </div>

        <div class="total-row">
          <span>Frete</span>

          <strong>
            ${orderMoney(
              order.frete
            )}
          </strong>
        </div>

        <div class="total-row">
          <span>Acréscimo</span>

          <strong>
            ${orderMoney(
              order.acrescimo
            )}
          </strong>
        </div>

        <div class="total-row">
          <span>Desconto</span>

          <strong>
            ${orderMoney(
              order.desconto
            )}
          </strong>
        </div>

        <div class="total-row grand-total">

          <span>
            TOTAL
          </span>

          <span>
            ${orderMoney(
              order.valor_total
            )}
          </span>

        </div>

      </div>

      ${
        order.observacoes
          ? `
            <div class="section">

              <div class="section-title">
                Observações
              </div>

              <div class="observations">
                ${escapeHtml(
                  order.observacoes
                )}
              </div>

            </div>
          `
          : ""
      }

      <div class="footer">
        Documento gerado pelo Gestão Loja
      </div>

    </body>

    </html>
  `);

  pdfWindow.document.close();

  setTimeout(
    function() {
      pdfWindow.focus();
      pdfWindow.print();
    },
    500
  );
}

document.addEventListener(
  "DOMContentLoaded",
  async function() {
    try {
      const authenticated =
        await requireAuth();

      if (!authenticated) {
        return;
      }

      if (!currentUser) {
        return;
      }

      const contextLoaded =
        await loadUserContext();

      if (!contextLoaded) {
        return;
      }

      const subtitle =
        document.getElementById(
          "pageSubtitle"
        );

      if (subtitle) {
        subtitle.textContent =
          "Gerencie os pedidos dos clientes";
      }

      await Promise.all([
        loadClients(),
        loadProducts(),
        loadVariations()
      ]);

      await loadOrders();

    } catch (error) {
      console.error(
        "Erro na página de pedidos:",
        error
      );

      const container =
        document.getElementById(
          "ordersContainer"
        );

      if (container) {
        container.innerHTML = `
          <div class="card">

            <h3>
              Erro ao carregar a página
            </h3>

            <p>
              ${escapeHtml(
                error.message ||
                "Erro desconhecido."
              )}
            </p>

          </div>
        `;
      }
    }
  }
);