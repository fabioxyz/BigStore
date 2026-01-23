// index.js
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ActivityType } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});



// Configurações da loja (ajusta conforme necessário)
const CONFIG = {
    LOJA_NOME: "BigStore",
    COR_PRINCIPAL: 0x5865F2,
    CATEGORIA_TICKETS: "FAQ",
    CATEGORIA_BACKUP: "tickets-backup",
    ROLE_STAFF: "Staff"
};

// Sistema de tickets (em produção, usa base de dados)
const ticketsAtivos = new Map(); // userId -> { channelId, ownerId }
const pedidosFechamento = new Map(); // channelId -> userId (quem pediu)

client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    client.user.setActivity('bigstorept.store', { type: ActivityType.Watching });
});

// Comando para criar painel de tickets
client.on('messageCreate', async message => {
    if (message.content === '!setup-tickets' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle(`🛒 Suporte - ${CONFIG.LOJA_NOME}`)
            .setDescription('Precisa de ajuda? Clica no botão abaixo para abrir um ticket!\n\n' +
                '**Motivos comuns:**\n' +
                '• Dúvidas sobre produtos\n' +
                '• Problemas com encomendas\n' +
                '• Reclamações\n' +
                '• Parcerias')
            .setColor(CONFIG.COR_PRINCIPAL)
            .setFooter({ text: 'Tempo médio de resposta: 1-2 horas' });

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('criar_ticket')
                    .setLabel('📩 Abrir Ticket')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.channel.send({ embeds: [embed], components: [button] });
        await message.delete();
    }

    // Comando para ver catálogo
    if (message.content.startsWith('!catalogo')) {
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Serviços Disponíveis')
            .setDescription('**Impulsiona as tuas redes sociais com os nossos serviços premium!**\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━')
            .addFields(
                { 
                    name: '📸 INSTAGRAM SERVICES', 
                    value: '**Instagram Followers** (1000) • `$11.99`\n' +
                           '**Instagram Likes** (500) • `$4.99`\n' +
                           '**Instagram Views** (1000) • `$3.99`',
                    inline: false 
                },
                { 
                    name: '🎥 YOUTUBE SERVICES', 
                    value: '**YouTube Subscribers** (1000) • `$29.99`\n' +
                           '**YouTube Views** (1000) • `$9.99`\n' +
                           '**YouTube Likes** (500) • `$5.99`',
                    inline: false 
                },
                { 
                    name: '🎵 TIKTOK SERVICES', 
                    value: '**TikTok Followers** (1000) • `$7.99`\n' +
                           '**TikTok Likes** (1000) • `$4.99`\n' +
                           '**TikTok Views** (1000) • `$3.49`',
                    inline: false 
                },
                {
                    name: '🎁 DESCONTOS AUTOMÁTICOS',
                    value: '💰 **Pedidos acima de $20:** `5% OFF`\n' +
                           '💎 **Pedidos acima de $50:** `10% OFF`\n' +
                           '🔥 **Pedidos acima de $100:** `15% OFF`',
                    inline: false
                }
            )
            .setColor(CONFIG.COR_PRINCIPAL)
            .setFooter({ text: '💡 Para encomendas personalizadas e quantidades diferentes, abre um ticket!' })
            .setTimestamp();

        const buyButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('criar_ticket')
                    .setLabel('🛒 Fazer Encomenda')
                    .setStyle(ButtonStyle.Success)
            );

        await message.reply({ embeds: [embed], components: [buyButton] });
    }

    // Comando de ajuda
    if (message.content === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('ℹ️ Comandos Disponíveis')
            .addFields(
                { name: '!catalogo', value: 'Ver produtos disponíveis' },
                { name: '!help', value: 'Mostrar esta mensagem' },
                { name: '!info', value: 'Informações sobre a loja' }
            )
            .setColor(CONFIG.COR_PRINCIPAL);

        await message.reply({ embeds: [embed] });
    }

    // Comando info
    if (message.content === '!info') {
        const embed = new EmbedBuilder()
            .setTitle(`ℹ️ Sobre ${CONFIG.LOJA_NOME}`)
            .setDescription('Bem-vindo à nossa loja! Oferecemos produtos de qualidade com entrega rápida.')
            .addFields(
                { name: '⏰ Horário', value: 'Segunda a Sexta: 9h-18h' },
                { name: '📧 Email', value: 'suporte@minhaloja.pt' },
                { name: '🚚 Entregas', value: '24-48 horas úteis' }
            )
            .setColor(CONFIG.COR_PRINCIPAL);

        await message.reply({ embeds: [embed] });
    }
});

// Função auxiliar para verificar se é staff
function isStaff(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator) || 
           member.roles.cache.some(role => role.name === CONFIG.ROLE_STAFF);
}

// Sistema de tickets com botões
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // Criar ticket
    if (interaction.customId === 'criar_ticket') {
        const ticketExistente = ticketsAtivos.get(interaction.user.id);
        if (ticketExistente) {
            return interaction.reply({ 
                content: `❌ Já tens um ticket aberto: <#${ticketExistente.channelId}>`, 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        let categoria = interaction.guild.channels.cache.find(
            c => c.name === CONFIG.CATEGORIA_TICKETS && c.type === 4
        );

        if (!categoria) {
            categoria = await interaction.guild.channels.create({
                name: CONFIG.CATEGORIA_TICKETS,
                type: 4
            });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: 0,
            parent: categoria.id,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        const staffRole = interaction.guild.roles.cache.find(r => r.name === CONFIG.ROLE_STAFF);
        if (staffRole) {
            await ticketChannel.permissionOverwrites.create(staffRole, {
                ViewChannel: true,
                SendMessages: true
            });
        }

        ticketsAtivos.set(interaction.user.id, { 
            channelId: ticketChannel.id, 
            ownerId: interaction.user.id 
        });

        const ticketEmbed = new EmbedBuilder()
            .setTitle('🎫 Ticket Criado')
            .setDescription(`Olá ${interaction.user}!\n\nDescreve o teu problema e a nossa equipa irá ajudar-te o mais rápido possível.`)
            .setColor(CONFIG.COR_PRINCIPAL)
            .setTimestamp();

        const fecharButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('fechar_ticket')
                    .setLabel('🔒 Fechar Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

        await ticketChannel.send({ embeds: [ticketEmbed], components: [fecharButton] });
        await interaction.editReply({ content: `✅ Ticket criado: ${ticketChannel}` });
    }

    // Pedido para fechar ticket
    if (interaction.customId === 'fechar_ticket') {
        // Verificar se já existe pedido pendente
        if (pedidosFechamento.has(interaction.channel.id)) {
            return interaction.reply({ 
                content: '⚠️ Já existe um pedido de fechamento pendente para este ticket.', 
                ephemeral: true 
            });
        }

        pedidosFechamento.set(interaction.channel.id, interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Pedido de Fechamento')
            .setDescription(`${interaction.user} pediu para fechar este ticket.\n\n**Staff:** Escolhe uma ação abaixo.`)
            .setColor(0xFFA500)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirmar_fechar')
                    .setLabel('✅ Fechar e Deletar')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('arquivar_ticket')
                    .setLabel('📁 Arquivar')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('cancelar_fechar')
                    .setLabel('❌ Cancelar')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // Confirmar fechamento (deletar)
    if (interaction.customId === 'confirmar_fechar') {
        if (!isStaff(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Apenas staff pode confirmar o fechamento!', 
                ephemeral: true 
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket a fechar...')
            .setDescription(`Fechado por ${interaction.user}\nEste canal será eliminado em 5 segundos.`)
            .setColor(0xFF0000);

        await interaction.reply({ embeds: [embed] });

        // Remover dos Maps
        for (const [userId, data] of ticketsAtivos.entries()) {
            if (data.channelId === interaction.channel.id) {
                ticketsAtivos.delete(userId);
                break;
            }
        }
        pedidosFechamento.delete(interaction.channel.id);

        setTimeout(() => {
            interaction.channel.delete();
        }, 5000);
    }

    // Arquivar ticket
    if (interaction.customId === 'arquivar_ticket') {
        if (!isStaff(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Apenas staff pode arquivar tickets!', 
                ephemeral: true 
            });
        }

        await interaction.deferReply();

        // Criar/encontrar categoria de backup
        let categoriaBackup = interaction.guild.channels.cache.find(
            c => c.name === CONFIG.CATEGORIA_BACKUP && c.type === 4
        );

        if (!categoriaBackup) {
            categoriaBackup = await interaction.guild.channels.create({
                name: CONFIG.CATEGORIA_BACKUP,
                type: 4
            });
        }

        // Encontrar o dono do ticket
        let ownerId = null;
        for (const [userId, data] of ticketsAtivos.entries()) {
            if (data.channelId === interaction.channel.id) {
                ownerId = userId;
                break;
            }
        }

        // Remover permissão do usuário de ver o canal
        if (ownerId) {
            await interaction.channel.permissionOverwrites.edit(ownerId, {
                ViewChannel: false
            });
            ticketsAtivos.delete(ownerId);
        }

        // Mover para categoria de backup
        await interaction.channel.setParent(categoriaBackup.id);
        
        // Renomear canal para indicar que está arquivado
        const newName = interaction.channel.name.replace('ticket-', 'archived-');
        await interaction.channel.setName(newName);

        pedidosFechamento.delete(interaction.channel.id);

        const embed = new EmbedBuilder()
            .setTitle('📁 Ticket Arquivado')
            .setDescription(`Arquivado por ${interaction.user}\n\nO utilizador não pode mais ver este canal.\nEste ticket permanecerá disponível para consulta da staff.`)
            .setColor(0x808080)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
    }

    // Cancelar fechamento
    if (interaction.customId === 'cancelar_fechar') {
        if (!isStaff(interaction.member)) {
            return interaction.reply({ 
                content: '❌ Apenas staff pode cancelar o pedido!', 
                ephemeral: true 
            });
        }

        pedidosFechamento.delete(interaction.channel.id);

        const embed = new EmbedBuilder()
            .setTitle('✅ Pedido Cancelado')
            .setDescription(`${interaction.user} cancelou o pedido de fechamento.\nO ticket continua aberto.`)
            .setColor(0x00FF00);

        await interaction.update({ embeds: [embed], components: [] });
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
